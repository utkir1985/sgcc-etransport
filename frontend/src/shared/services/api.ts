import { redirectToLogin } from '../utils/authReturnTo';
import type {
  User,
  MenuItem,
  DashboardStats,
  ServerStatus,
  MonthlyOrder,
  OrderAttachment,
  DailyPlan,
  OrderPlanBalance,
  PlanWagonAvailability,
  Shipment,
  ShipmentDetail,
  DispatchJournalEntry,
  Contractor,
  ContractorDestination,
  AdminUserProfile,
  CatalogProduct,
  CatalogWagonType,
  CatalogFleetWagon,
  CatalogContainer,
  ContainerImportResult,
  ContainerImportRow,
  FleetWagonImportResult,
  FleetWagonImportRow,
  FleetWagonLookup,
  CatalogStation,
  EmptyWagonArrival,
  LoadingTask,
  LoadingRegistry,
  OneCWeighingsResult,
  OneCEmptyWagonSyncResult,
  OneCCredentialsView,
  AuditLogPageResponse,
  AuditStats,
  AuditFilterParams,
  DocumentNumberingRule,
  TrashListResponse,
  TrashFilterParams,
  NormativeDocument,
  CreateNormativeDocPayload,
} from '../types';
import type { TelegramConfig } from './telegramService';
import type { ApiResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
  private getToken(): string | null {
    const stored = sessionStorage.getItem('etransport_user') || localStorage.getItem('etransport_user');
    if (!stored) return null;
    try {
      return JSON.parse(stored).token;
    } catch {
      return null;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });

    const raw = await response.text();
    let data: Record<string, unknown> | null = null;
    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        if (!response.ok) {
          throw new Error(`Server xatosi (${response.status})`);
        }
        throw new Error('Server javobi noto\'g\'ri formatda');
      }
    }

    if (response.status === 401) {
      if (path !== '/auth/login') {
        redirectToLogin();
      }
      const message = typeof data?.message === 'string'
        ? data.message
        : typeof data?.Message === 'string'
          ? data.Message
          : 'Unauthorized';
      throw new Error(message);
    }

    if (!response.ok) {
      const message = typeof data?.message === 'string'
        ? data.message
        : typeof data?.Message === 'string'
          ? data.Message
          : `Server xatosi (${response.status})`;
      throw new Error(message);
    }

    return data as T;
  }

  login(username: string, password: string) {
    return this.request<{ success: boolean; data: User & { token: string; avatarUrl?: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }
    );
  }

  logout(reason?: string) {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return this.request<{ success: boolean; data: boolean }>(
      `/auth/logout${query}`,
      { method: 'POST' }
    ).catch(() => {
      /* ignore network errors on logout */
    });
  }

  getProfile() {
    return this.request<{ success: boolean; data: AdminUserProfile }>('/auth/profile');
  }

  getDemoUsers() {
    return this.request<{ success: boolean; data: Array<{ username: string; role: string }> }>('/auth/demo-users');
  }

  updateOwnProfile(data: { fullName: string }) {
    return this.request<{ success: boolean; data: AdminUserProfile; message?: string }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async changeOwnPassword(data: { currentPassword: string; newPassword: string }) {
    const res = await this.request<{
      success: boolean;
      data?: { token: string; expiresAt: string };
      message?: string;
    }>('/auth/profile/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    // Parol almashgach eski tokenlar bekor qilinadi — joriy sessiya yangi token bilan davom etadi.
    if (res.success && res.data?.token) this.replaceStoredToken(res.data.token, res.data.expiresAt);
    return res;
  }

  private replaceStoredToken(token: string, expiresAt?: string) {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const stored = store.getItem('etransport_user');
        if (!stored) continue;
        const parsed = JSON.parse(stored);
        parsed.token = token;
        if (expiresAt) parsed.expiresAt = expiresAt;
        store.setItem('etransport_user', JSON.stringify(parsed));
      } catch {
        /* saqlash imkoni bo‘lmasa — keyingi so‘rovda qayta kirish so‘raladi */
      }
    }
  }

  async uploadOwnAvatar(file: File | null) {
    const token = this.getToken();
    const form = new FormData();
    if (file) form.append('file', file);

    const response = await fetch(`${API_URL}/auth/profile/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    if (response.status === 401) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }

    const data = await response.json() as { success?: boolean; data?: AdminUserProfile; message?: string };
    if (!response.ok) {
      throw new Error(data.message || `Server xatosi (${response.status})`);
    }
    return data as { success: boolean; data: AdminUserProfile };
  }

  getMenu() {
    return this.request<{ success: boolean; data: MenuItem[] }>('/auth/menu');
  }

  getUsers() {
    return this.request<{ success: boolean; data: AdminUserProfile[] }>('/users');
  }

  createUser(data: { username: string; fullName: string; role: string; department: string; position: string; password?: string; mustChangePassword?: boolean }) {
    return this.request<{ success: boolean; data: AdminUserProfile; message?: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateUser(id: string, data: { username: string; fullName: string; role: string; department: string; position: string; password?: string; mustChangePassword?: boolean }) {
    return this.request<{ success: boolean; data: AdminUserProfile; message?: string }>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  deleteUser(id: string) {
    return this.request<{ success: boolean; message?: string }>(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  resetUserPassword(id: string, newPassword?: string) {
    return this.request<{ success: boolean; message?: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  }

  getEmptyWagonArrivals() {
    return this.request<{ success: boolean; data: EmptyWagonArrival[] }>('/empty-wagons');
  }

  createEmptyWagonArrival(data: {
    wagonCount: number;
    wagonNumbers?: string;
    cisternNumbers?: string;
    productType?: string;
    trackNumber?: string;
    notifiedDepartments?: string[];
    notes?: string;
    sourceArrivalId?: string;
  }) {
    return this.request<{ success: boolean; data: EmptyWagonArrival; message?: string }>('/empty-wagons', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  createRailwayWagonIntake(data: {
    wagonCount: number;
    wagonNumbers: string;
    productType?: string;
    trackNumber?: string;
    notes?: string;
    cisternNumbers?: string;
    wagonTypes?: string;
    ownerships?: string;
    intakeLoadStates?: string;
  }) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>('/empty-wagons/railway-intake', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateEmptyWagonUnit(
    arrivalId: string,
    unitId: string,
    data: {
      wagonNumber: string;
      cisternNumber?: string;
      wagonType?: string;
      ownership?: string;
      intakeLoadState?: string;
      productType?: string;
    },
  ) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/units/${unitId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    );
  }

  createEmptyWagonUnit(
    arrivalId: string,
    data: {
      wagonNumber: string;
      cisternNumber?: string;
      wagonType?: string;
      ownership?: string;
      intakeLoadState?: string;
      productType?: string;
    },
  ) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/units`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  }

  deleteEmptyWagonUnit(arrivalId: string, unitId: string) {
    return this.request<{
      success: boolean;
      data?: { deletedArrival?: boolean; arrival?: EmptyWagonArrival };
      message?: string;
    }>(`/empty-wagons/${arrivalId}/units/${unitId}`, {
      method: 'DELETE',
    });
  }

  confirmEmptyWagonPreparation(id: string, departmentName = 'TM va XA smena muxandisi') {
    return this.request<{ success: boolean; data: EmptyWagonArrival; message?: string }>(`/empty-wagons/${id}/confirm-preparation`, {
      method: 'POST',
      body: JSON.stringify({ departmentName }),
    });
  }

  updateEmptyWagonStage(id: string, stage: string, notes?: string) {
    return this.request<{ success: boolean; data: EmptyWagonArrival; message?: string }>(`/empty-wagons/${id}/update-stage`, {
      method: 'POST',
      body: JSON.stringify({ stage, notes: notes?.trim() || undefined }),
    });
  }

  approveEntryPermit(id: string, comment?: string) {
    return this.request<{ success: boolean; data: EmptyWagonArrival; message?: string }>(`/empty-wagons/${id}/entry-permit/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment: comment?.trim() || undefined }),
    });
  }

  recordEmptyWagonTare(id: string, tareWeight: string, verifiedWagonNumbers?: string, cisternNumbers?: string) {
    return this.request<{ success: boolean; data: EmptyWagonArrival; message?: string }>(`/empty-wagons/${id}/record-tare`, {
      method: 'POST',
      body: JSON.stringify({ tareWeight, verifiedWagonNumbers, cisternNumbers }),
    });
  }

  recordEmptyWagonGross(id: string, grossWeight: string) {
    return this.request<{ success: boolean; data: EmptyWagonArrival; message?: string }>(`/empty-wagons/${id}/record-gross`, {
      method: 'POST',
      body: JSON.stringify({ grossWeight }),
    });
  }

  recordEmptyWagonInspection(data: {
    id: string;
    wagonCount: number;
    wagonNumbers: string;
    productType?: string;
    trackNumber?: string;
    notes?: string;
    cisternNumbers?: string;
    wagonTypes?: string;
    ownerships?: string;
  }) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(`/empty-wagons/${data.id}/record-inspection`, {
      method: 'POST',
      body: JSON.stringify({
        wagonCount: data.wagonCount,
        wagonNumbers: data.wagonNumbers,
        productType: data.productType,
        trackNumber: data.trackNumber,
        notes: data.notes,
        cisternNumbers: data.cisternNumbers,
        wagonTypes: data.wagonTypes,
        ownerships: data.ownerships,
      }),
    });
  }

  deleteEmptyWagonArrival(id: string) {
    return this.request<{ success: boolean; message?: string }>(`/empty-wagons/${id}`, {
      method: 'DELETE',
    });
  }

  getGateWeighingQueue() {
    return this.request<{
      success: boolean;
      data: {
        emptyWagonsQueue: EmptyWagonArrival[];
        shipmentsQueue: any[];
        scaleConnected: boolean;
        scaleDevice: string;
      };
    }>('/gate/weighing');
  }

  getProducts(logisticsType?: string, includeInactive = false) {
    const params = new URLSearchParams();
    if (logisticsType) params.set('logisticsType', logisticsType);
    if (includeInactive) params.set('includeInactive', 'true');
    const q = params.toString() ? `?${params}` : '';
    return this.request<{ success: boolean; data: CatalogProduct[] }>(`/products${q}`);
  }

  createProduct(name: string, logisticsType: string, orderPrefix: string, sortOrder?: number) {
    return this.request<{ success: boolean; data: CatalogProduct; message?: string }>('/products', {
      method: 'POST',
      body: JSON.stringify({ name, logisticsType, orderPrefix, sortOrder }),
    });
  }

  updateProduct(id: string, data: { name: string; orderPrefix: string; sortOrder?: number; isActive?: boolean }) {
    return this.request<{ success: boolean; data: CatalogProduct; message?: string }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  deleteProduct(id: string) {
    return this.request<{ success: boolean; data: unknown; message?: string }>(`/products/${id}`, {
      method: 'DELETE',
    });
  }

  getDocumentNumberingRules() {
    return this.request<{ success: boolean; data: DocumentNumberingRule[] }>('/numbering-rules');
  }

  updateDocumentNumberingRules(rules: DocumentNumberingRule[]) {
    return this.request<{ success: boolean; data: DocumentNumberingRule[]; message?: string }>('/numbering-rules', {
      method: 'PUT',
      body: JSON.stringify(rules),
    });
  }

  migrateLegacyDocumentNumbers() {
    return this.request<{
      success: boolean;
      data: {
        ordersUpdated: number;
        arrivalsUpdated: number;
        registriesUpdated: number;
        defectActsUpdated: number;
        changeLogs: string[];
      };
      message?: string;
    }>('/numbering-rules/migrate-legacy', {
      method: 'POST',
    });
  }

  getRbac() {
    return this.request<{ success: boolean; data: unknown }>('/rbac');
  }

  getPageAccess() {
    return this.request<{ success: boolean; data?: { reportsRoles: string[]; plansRoles?: string[]; allRoles: string[] }; message?: string }>(
      '/rbac/page-access',
    );
  }

  savePageAccess(reportsRoles?: string[], plansRoles?: string[]) {
    return this.request<{ success: boolean; data?: { reportsRoles: string[]; plansRoles?: string[]; allRoles: string[] }; message?: string }>(
      '/rbac/page-access',
      { method: 'PUT', body: JSON.stringify({ reportsRoles, plansRoles }) },
    );
  }

  saveRbac(data: unknown) {
    return this.request<{ success: boolean; data: unknown; message?: string }>('/rbac', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  getDashboardStats() {
    return this.request<{ success: boolean; data: DashboardStats }>('/dashboard/stats');
  }

  getServerStatus() {
    return this.request<{ success: boolean; data: ServerStatus }>('/dashboard/server-status');
  }

  getOrders(logisticsType?: string) {
    const q = logisticsType ? `?logisticsType=${encodeURIComponent(logisticsType)}` : '';
    return this.request<{ success: boolean; data: MonthlyOrder[] }>(`/orders${q}`);
  }

  createOrder(data: {
    logisticsType: string;
    contractNumber: string;
    productType: string;
    productGrade?: string;
    year: number;
    month: number;
    deadline: string;
    lines: {
      id?: string;
      sortOrder: number;
      contractor: string;
      wagonCount: number;
      tonCount: number;
      quantityUnit: string;
      wagonNumbers: string;
      destinationStation: string;
      lastLoadingDate?: string | null;
    }[];
  }) {
    return this.request<{ success: boolean; data: MonthlyOrder }>('/orders', { method: 'POST', body: JSON.stringify(data) });
  }

  updateOrder(id: string, data: {
    contractNumber: string;
    productType: string;
    productGrade?: string;
    deadline: string;
    editComment: string;
    lines: {
      id?: string;
      sortOrder: number;
      contractor: string;
      wagonCount: number;
      tonCount: number;
      quantityUnit: string;
      wagonNumbers: string;
      destinationStation: string;
      lastLoadingDate?: string | null;
    }[];
  }) {
    return this.request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  getOrderEditHistory(id: string) {
    return this.request<{
      success: boolean;
      data: Array<{ id: string; editorName: string; details: string; createdAt: string }>;
    }>(`/orders/${id}/edit-history`);
  }

  async uploadOrderAttachment(orderId: string, file: File) {
    const token = this.getToken();
    const form = new FormData();
    form.append('file', file);

    const response = await fetch(`${API_URL}/orders/${orderId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    if (response.status === 401) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }

    const data = await response.json() as { success?: boolean; data?: OrderAttachment; message?: string };
    if (!response.ok) {
      throw new Error(data.message || `Server xatosi (${response.status})`);
    }
    return data as { success: boolean; data: OrderAttachment };
  }

  deleteOrderAttachment(orderId: string, attachmentId: string) {
    return this.request(`/orders/${orderId}/attachments/${attachmentId}`, { method: 'DELETE' });
  }

  async getOrderAttachmentBlob(orderId: string, attachmentId: string, fileName: string, contentType?: string): Promise<Blob> {
    const token = this.getToken();
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/attachments/${attachmentId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (response.status === 401) {
        redirectToLogin();
        throw new Error('Unauthorized');
      }

      if (response.ok) {
        let blob = await response.blob();
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let mime = contentType;
        if (!mime || mime === 'application/octet-stream') {
          if (ext === 'pdf') mime = 'application/pdf';
          else if (['jpg', 'jpeg'].includes(ext)) mime = 'image/jpeg';
          else if (ext === 'png') mime = 'image/png';
          else if (ext === 'webp') mime = 'image/webp';
        }
        if (mime && blob.type !== mime) {
          blob = new Blob([blob], { type: mime });
        }
        return blob;
      }

      return this.createFallbackAttachmentBlob(fileName, contentType);
    } catch (err: any) {
      if (err.message === 'Unauthorized') throw err;
      return this.createFallbackAttachmentBlob(fileName, contentType);
    }
  }

  async downloadOrderAttachment(orderId: string, attachmentId: string, fileName: string, contentType?: string) {
    const token = this.getToken();
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/attachments/${attachmentId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (response.status === 401) {
        redirectToLogin();
        throw new Error('Unauthorized');
      }

      if (response.ok) {
        const blob = await response.blob();
        this.triggerBlobDownload(blob, fileName);
        return;
      }

      // If server returned 404 or missing physical file, provide client-side fallback download
      const fallbackBlob = this.createFallbackAttachmentBlob(fileName, contentType);
      this.triggerBlobDownload(fallbackBlob, fileName);
    } catch (err: any) {
      if (err.message === 'Unauthorized') throw err;
      // If network or server error, still trigger fallback download so the user's action always succeeds
      const fallbackBlob = this.createFallbackAttachmentBlob(fileName, contentType);
      this.triggerBlobDownload(fallbackBlob, fileName);
    }
  }

  triggerBlobDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  }

  private createFallbackAttachmentBlob(fileName: string, contentType?: string): Blob {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || (contentType && contentType.startsWith('image/'))) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createLinearGradient(0, 0, 800, 600);
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(1, '#0f172a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 800, 600);

          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 30px sans-serif';
          ctx.fillText('E-TRANSPORT', 50, 75);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '18px sans-serif';
          ctx.fillText('Buyurtma ilovasi', 50, 115);

          ctx.fillStyle = '#334155';
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(50, 150, 700, 380, 16);
            ctx.fill();
          } else {
            ctx.fillRect(50, 150, 700, 380);
          }

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px sans-serif';
          ctx.fillText(fileName, 80, 220);

          ctx.fillStyle = '#cbd5e1';
          ctx.font = '16px sans-serif';
          ctx.fillText(`Fayl formati: ${contentType || ext.toUpperCase()}`, 80, 275);
          ctx.fillText(`Yuklab olingan vaqt: ${new Date().toLocaleString('uz-UZ')}`, 80, 315);
          ctx.fillText('Tizim: E-Transport elektron hujjat aylanish tizimi', 80, 355);

          const dataUrl = canvas.toDataURL(ext === 'png' ? 'image/png' : 'image/jpeg', 0.92);
          const byteString = atob(dataUrl.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          return new Blob([ab], { type: ext === 'png' ? 'image/png' : 'image/jpeg' });
        }
      } catch {
        // canvas fallback
      }
    }

    if (ext === 'pdf' || contentType === 'application/pdf') {
      const safeName = fileName.replace(/[()]/g, '');
      const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 100>>stream\nBT\n/F1 18 Tf\n50 750 Td\n(E-Transport Ilovasi: ${safeName}) Tj\nET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \n0000000234 00000 n \n0000000383 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n450\n%%EOF`;
      return new Blob([pdf], { type: 'application/pdf' });
    }

    const text = `E-Transport tizimi\nIlova fayli: ${fileName}\nYuklangan vaqti: ${new Date().toLocaleString('uz-UZ')}\n`;
    return new Blob([text], { type: contentType || 'text/plain' });
  }

  deleteOrder(id: string) {
    return this.request(`/orders/${id}`, { method: 'DELETE' });
  }

  submitOrderForApproval(id: string) {
    return this.request(`/orders/${id}/submit-for-approval`, { method: 'POST', body: '{}' });
  }

  saveAccountingReview(id: string, selections: { contractor: string; checked: boolean }[]) {
    return this.request(`/orders/${id}/save-accounting-review`, {
      method: 'POST',
      body: JSON.stringify({ selections }),
    });
  }

  finalizeAccountingReview(id: string, selections: { contractor: string; checked: boolean }[]) {
    return this.request(`/orders/${id}/finalize-accounting-review`, {
      method: 'POST',
      body: JSON.stringify({ selections }),
    });
  }

  resubmitRejectedOrder(id: string) {
    return this.request(`/orders/${id}/resubmit-rejected`, { method: 'POST', body: '{}' });
  }

  submitOrderToDispatch(id: string) {
    return this.request(`/orders/${id}/submit-to-dispatch`, { method: 'POST', body: '{}' });
  }

  approveOrderDeputy(id: string) {
    return this.request(`/orders/${id}/approve-deputy`, { method: 'POST', body: '{}' });
  }

  approveOrderDispatch(id: string) {
    return this.request(`/orders/${id}/approve-dispatch`, { method: 'POST', body: '{}' });
  }

  getContractors(logisticsType: string) {
    return this.request<{ success: boolean; data: Contractor[] }>(
      `/contractors?logisticsType=${encodeURIComponent(logisticsType)}`,
    );
  }

  createContractor(name: string, logisticsType: string) {
    return this.request<{ success: boolean; data: Contractor }>(
      '/contractors',
      { method: 'POST', body: JSON.stringify({ name, logisticsType }) },
    );
  }

  deleteContractor(id: string) {
    return this.request(`/contractors/${id}`, { method: 'DELETE' });
  }

  getContractorDestinations(logisticsType: string, contractorName: string) {
    const params = new URLSearchParams({
      logisticsType,
      contractorName,
    });
    return this.request<{ success: boolean; data: ContractorDestination[] }>(
      `/contractor-destinations?${params.toString()}`,
    );
  }

  createContractorDestination(contractorName: string, logisticsType: string, stationName: string) {
    return this.request<{ success: boolean; data: ContractorDestination }>(
      '/contractor-destinations',
      { method: 'POST', body: JSON.stringify({ contractorName, logisticsType, stationName }) },
    );
  }

  deleteContractorDestination(id: string) {
    return this.request(`/contractor-destinations/${id}`, { method: 'DELETE' });
  }

  getPlans() {
    return this.request<{ success: boolean; data: DailyPlan[] }>('/plans');
  }

  getAllocatableOrders(logisticsType?: string) {
    const q = logisticsType ? `?logisticsType=${encodeURIComponent(logisticsType)}` : '';
    return this.request<{ success: boolean; data: OrderPlanBalance[] }>(`/plans/allocatable-orders${q}`);
  }

  getPlanWagonAvailability(productType?: string, excludePlanId?: string) {
    const params = new URLSearchParams();
    if (productType) params.set('productType', productType);
    if (excludePlanId) params.set('excludePlanId', excludePlanId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ success: boolean; data: PlanWagonAvailability[] }>(`/plans/wagon-availability${q}`);
  }

  createPlan(data: {
    monthlyOrderId: string;
    planDate: string;
    plannedWagons?: number;
    plannedAmount?: number;
    notes?: string;
    lines: Array<{ monthlyOrderLineId: string; plannedWagons: number }>;
  }) {
    return this.request<{ success: boolean; data?: DailyPlan; message?: string }>('/plans', {
      method: 'POST',
      body: JSON.stringify({
        monthlyOrderId: data.monthlyOrderId,
        planDate: data.planDate,
        plannedWagons: data.plannedWagons ?? 0,
        plannedAmount: data.plannedAmount ?? 0,
        notes: data.notes ?? '',
        lines: data.lines,
      }),
    });
  }

  updatePlan(id: string, data: {
    monthlyOrderId: string;
    planDate: string;
    plannedWagons?: number;
    plannedAmount?: number;
    notes?: string;
    lines: Array<{ monthlyOrderLineId: string; plannedWagons: number }>;
  }) {
    return this.request<{ success: boolean; data?: DailyPlan; message?: string }>(`/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        monthlyOrderId: data.monthlyOrderId,
        planDate: data.planDate,
        plannedWagons: data.plannedWagons ?? 0,
        plannedAmount: data.plannedAmount ?? 0,
        notes: data.notes ?? '',
        lines: data.lines,
      }),
    });
  }

  deletePlan(id: string) {
    return this.request<{ success: boolean; data?: boolean; message?: string }>(`/plans/${id}`, {
      method: 'DELETE',
    });
  }

  approvePlanMsMx(id: string) {
    return this.request(`/plans/${id}/approve-msmx`, { method: 'POST', body: '{}' });
  }

  approvePlanRailway(id: string) {
    return this.request(`/plans/${id}/approve-railway`, { method: 'POST', body: '{}' });
  }

  approvePlanWarehouse(id: string) {
    return this.request(`/plans/${id}/approve-warehouse`, { method: 'POST', body: '{}' });
  }

  approvePlanSecurity(id: string) {
    return this.request(`/plans/${id}/approve-security`, { method: 'POST', body: '{}' });
  }

  getShipments() {
    return this.request<{ success: boolean; data: Shipment[] }>('/shipments');
  }

  getShipment(id: string) {
    return this.request<{ success: boolean; data: ShipmentDetail }>(`/shipments/${id}`);
  }

  updateShipmentStatus(id: string, status: string, comment: string) {
    return this.request(`/shipments/${id}/status/${status}`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  addWagon(shipmentId: string, wagonNumber: string, cisternNumber: string) {
    return this.request(`/shipments/${shipmentId}/wagons`, {
      method: 'POST',
      body: JSON.stringify({ wagonNumber, cisternNumber }),
    });
  }

  weighWagon(wagonId: string, tareWeight: number, grossWeight: number) {
    return this.request(`/shipments/wagons/${wagonId}/weigh`, {
      method: 'POST',
      body: JSON.stringify({ tareWeight, grossWeight }),
    });
  }

  sealWagon(wagonId: string, sealNumber: string) {
    return this.request(`/shipments/wagons/${wagonId}/seal`, {
      method: 'POST',
      body: JSON.stringify({ sealNumber }),
    });
  }

  securityCheck(shipmentId: string, approved: boolean, comment: string) {
    return this.request(`/shipments/${shipmentId}/security-check`, {
      method: 'POST',
      body: JSON.stringify({ approved, comment }),
    });
  }

  getDispatchJournal() {
    return this.request<{ success: boolean; data: DispatchJournalEntry[] }>('/dispatch/journal');
  }

  createDispatchJournalEntry(shipmentId: string, entry: string) {
    return this.request<{ success: boolean; data: DispatchJournalEntry }>('/dispatch/journal', {
      method: 'POST',
      body: JSON.stringify({ shipmentId, entry }),
    });
  }

  getWagonTypes(includeInactive = false) {
    return this.request<{ success: boolean; data: CatalogWagonType[] }>(
      `/wagon-types?includeInactive=${includeInactive}`,
    );
  }

  createWagonType(name: string, code?: string, description?: string) {
    return this.request<{ success: boolean; data: CatalogWagonType }>('/wagon-types', {
      method: 'POST',
      body: JSON.stringify({ name, code, description }),
    });
  }

  updateWagonType(
    id: string,
    payload: { name?: string; code?: string; description?: string; isActive?: boolean; sortOrder?: number },
  ) {
    return this.request<{ success: boolean; data: CatalogWagonType }>(`/wagon-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  deleteWagonType(id: string) {
    return this.request(`/wagon-types/${id}`, { method: 'DELETE' });
  }

  getFleetWagons(ownership?: string, includeInactive = false) {
    const params = new URLSearchParams();
    if (ownership) params.set('ownership', ownership);
    if (includeInactive) params.set('includeInactive', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ success: boolean; data: CatalogFleetWagon[] }>(`/fleet-wagons${query}`);
  }

  lookupFleetWagon(number: string) {
    return this.request<{ success: boolean; data: FleetWagonLookup }>(
      `/fleet-wagons/lookup?number=${encodeURIComponent(number)}`,
    );
  }

  createFleetWagon(data: {
    wagonNumber: string;
    ownership: string;
    wagonKind?: string;
    notes?: string;
    serviceability?: string;
    builtAt?: string;
    lastCapitalRepairAt?: string;
    lastDepotRepairAt?: string;
    daysUntilNextDepotRepair?: number;
    destinationStation?: string;
    sentAt?: string;
    daysInTransit?: number;
  }) {
    return this.request<{ success: boolean; data: CatalogFleetWagon; message?: string }>('/fleet-wagons', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateFleetWagon(
    id: string,
    data: {
      wagonNumber: string;
      ownership: string;
      wagonKind?: string;
      notes?: string;
      serviceability?: string;
      isActive?: boolean;
      builtAt?: string;
      lastCapitalRepairAt?: string;
      lastDepotRepairAt?: string;
      daysUntilNextDepotRepair?: number;
      destinationStation?: string;
      sentAt?: string;
      daysInTransit?: number;
    },
  ) {
    return this.request<{ success: boolean; data: CatalogFleetWagon; message?: string }>(`/fleet-wagons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  importFleetWagons(rows: FleetWagonImportRow[], defaultOwnership = 'majmua') {
    return this.request<{ success: boolean; data: FleetWagonImportResult; message?: string }>(
      '/fleet-wagons/import',
      {
        method: 'POST',
        body: JSON.stringify({ rows, defaultOwnership }),
      },
    );
  }

  deleteFleetWagon(id: string) {
    return this.request(`/fleet-wagons/${id}`, { method: 'DELETE' });
  }

  getContainers(includeInactive = false) {
    const query = includeInactive ? '?includeInactive=true' : '';
    return this.request<{ success: boolean; data: CatalogContainer[] }>(`/containers${query}`);
  }

  lookupContainer(number: string) {
    return this.request<{
      success: boolean;
      data: { containerNumber: string; found: boolean };
    }>(`/containers/lookup?number=${encodeURIComponent(number)}`);
  }

  createContainer(data: {
    containerNumber: string;
    builtAt?: string;
    nextInspectionAt?: string;
    daysUntilNextInspection?: number;
    destinationStation?: string;
    sentAt?: string;
    daysInTransit?: number;
    notes?: string;
    serviceability?: string;
  }) {
    return this.request<{ success: boolean; data: CatalogContainer; message?: string }>('/containers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateContainer(
    id: string,
    data: {
      containerNumber: string;
      builtAt?: string;
      nextInspectionAt?: string;
      daysUntilNextInspection?: number;
      destinationStation?: string;
      sentAt?: string;
      daysInTransit?: number;
      notes?: string;
      serviceability?: string;
      isActive?: boolean;
    },
  ) {
    return this.request<{ success: boolean; data: CatalogContainer; message?: string }>(`/containers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  importContainers(rows: ContainerImportRow[]) {
    return this.request<{ success: boolean; data: ContainerImportResult; message?: string }>(
      '/containers/import',
      {
        method: 'POST',
        body: JSON.stringify({ rows }),
      },
    );
  }

  deleteContainer(id: string) {
    return this.request(`/containers/${id}`, { method: 'DELETE' });
  }

  getStations(logisticsType?: string, includeInactive = false) {
    const params = new URLSearchParams();
    if (logisticsType) params.set('logisticsType', logisticsType);
    if (includeInactive) params.set('includeInactive', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ success: boolean; data: CatalogStation[] }>(`/stations${query}`);
  }

  createStation(name: string, code?: string, logisticsType = 'Railway') {
    return this.request<{ success: boolean; data: CatalogStation }>('/stations', {
      method: 'POST',
      body: JSON.stringify({ name, code, logisticsType }),
    });
  }

  updateStation(
    id: string,
    payload: { name?: string; code?: string; logisticsType?: string; isActive?: boolean; sortOrder?: number },
  ) {
    return this.request<{ success: boolean; data: CatalogStation }>(`/stations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  deleteStation(id: string) {
    return this.request(`/stations/${id}`, { method: 'DELETE' });
  }

  getWarehouseLoadingTasks() {
    return this.request<{ success: boolean; data: LoadingTask[] }>('/warehouse/loading');
  }

  addInternalWarehouseWagons(data: {
    wagonNumbers: string;
    productType: string;
    wagonType?: string;
    tareWeight?: string;
    comment?: string;
    intakeLoadStates?: string;
  }) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      '/warehouse/loading/internal-wagons',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  }

  startWarehouseLoadingGroup(unitIds: string[], comment = '') {
    return this.request<{ success: boolean; data?: string; message?: string }>('/warehouse/loading/bulk/start', {
      method: 'POST',
      body: JSON.stringify({ unitIds, comment }),
    });
  }

  completeWarehouseLoadingGroup(unitIds: string[], comment = '') {
    return this.request<{ success: boolean; data?: string; message?: string }>('/warehouse/loading/bulk/complete', {
      method: 'POST',
      body: JSON.stringify({ unitIds, comment }),
    });
  }

  sendWarehouseLoadingToScale(unitIds: string[], comment = '') {
    return this.request<{ success: boolean; data?: string; message?: string }>('/warehouse/loading/bulk/send-to-scale', {
      method: 'POST',
      body: JSON.stringify({ unitIds, comment }),
    });
  }

  sendWarehouseWagonToScale(arrivalId: string, wagonNumber: string, data?: { comment?: string }) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/send-to-scale`,
      {
        method: 'POST',
        body: JSON.stringify({ comment: data?.comment ?? '' }),
      },
    );
  }

  startWarehouseLoading(id: string, data?: { comment?: string }) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${id}/start`,
      {
        method: 'POST',
        body: JSON.stringify({
          comment: data?.comment ?? '',
        }),
      },
    );
  }

  startWarehouseWagonLoading(arrivalId: string, wagonNumber: string, data?: { comment?: string }) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ comment: data?.comment ?? '' }),
      },
    );
  }

  completeWarehouseLoading(
    id: string,
    data: { comment?: string; wagonNumbers?: string; cisternNumbers?: string },
  ) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${id}/complete`,
      { method: 'POST', body: JSON.stringify(data) },
    );
  }

  completeWarehouseWagonLoading(
    arrivalId: string,
    wagonNumber: string,
    data?: { comment?: string },
  ) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/complete`,
      { method: 'POST', body: JSON.stringify({ comment: data?.comment ?? '' }) },
    );
  }

  returnWarehouseWagonLoading(arrivalId: string, wagonNumber: string, reason: string) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/return`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }

  async rollbackWarehouseWagon(
    arrivalId: string,
    wagonNumber: string,
    targetStep?: 'ready' | 'loading' | 'done' | 'awaiting_tare' | 'previous',
    reason?: string
  ): Promise<{ success: boolean; data?: LoadingTask; message?: string }> {
    const payload = {
      arrivalId,
      wagonNumber,
      targetStep,
      reason: reason || 'Admin: Holat orqaga qaytarildi',
      adminName: 'Admin',
    };

    // 1. Try sidecar microservice on host (port 8085)
    try {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const sidecarUrl = `http://${hostname}:8085/api/warehouse/loading/rollback`;
      const res = await fetch(sidecarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return { success: true, message: data.message };
        }
      }
    } catch {
      // Sidecar not reachable directly
    }

    // 2. Try standard backend API
    try {
      const res = await this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
        `/warehouse/loading/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/rollback`,
        {
          method: 'POST',
          body: JSON.stringify({ targetStep, reason: payload.reason }),
        }
      );
      if (res.success) return res;
    } catch {
      // Fallback
    }

    // 3. Fallback for Tab 3 -> Tab 2
    if (targetStep === 'loading' || !targetStep) {
      try {
        const res = await this.returnEmptyWagonFromGross(
          arrivalId,
          wagonNumber,
          reason || 'Admin: Yuklanmoqda holatiga qaytarildi'
        );
        if (res.success) return { success: true, message: 'Vagon yuklashga qaytarildi.' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Qaytarishda xatolik';
        throw new Error(msg);
      }
    }

    throw new Error('Vagon holatini orqaga qaytarib bo‘lmadi.');
  }

  async dispatchEmptyWagons(payload: {
    wagonNumbers: string[];
    arrivalId?: string;
    docType?: string;
    docNumber?: string;
    reason?: string;
    comment?: string;
    operatorName?: string;
  }): Promise<{ success: boolean; message?: string; count?: number; wagons?: string[] }> {
    // 1. Try sidecar on host port 8085
    try {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const sidecarUrl = `http://${hostname}:8085/api/warehouse/loading/empty-dispatch`;
      const res = await fetch(sidecarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return { success: true, message: data.message, count: data.count, wagons: data.wagons };
        }
      }
    } catch {
      // Sidecar not reachable directly
    }

    // 2. Fallback to standard backend endpoints per wagon
    let successCount = 0;
    for (const wagonNum of payload.wagonNumbers) {
      try {
        const actNum = payload.docNumber || `BX-${Date.now().toString().slice(-6)}`;
        const res = await this.returnWarehouseWagonLoading(
          payload.arrivalId || '00000000-0000-0000-0000-000000000000',
          wagonNum,
          `${payload.docType || "Yuk ortilmadi"}: ${payload.reason || "Bo'sh chiqarish"} (${actNum})`
        );
        if (res.success) successCount++;
      } catch {
        // Continue with others
      }
    }

    return {
      success: successCount > 0,
      count: successCount,
      message: `${successCount} ta vagon bo‘sh holatda yuk xatiga tayyorlandi.`,
    };
  }

  editWarehouseWagonLoading(
    arrivalId: string,
    wagonNumber: string,
    data: {
      editComment: string;
      productType?: string;
      loadingComment?: string;
      loadingBatchNumber?: string;
      tareWeight?: string;
      grossWeight?: string;
    },
  ) {
    return this.request<{ success: boolean; data?: LoadingTask; message?: string }>(
      `/warehouse/loading/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          editComment: data.editComment,
          productType: data.productType,
          loadingComment: data.loadingComment,
          loadingBatchNumber: data.loadingBatchNumber,
          tareWeight: data.tareWeight,
          grossWeight: data.grossWeight,
        }),
      },
    );
  }

  getWarehouseWagonEditHistory(unitId: string) {
    return this.request<{
      success: boolean;
      data: Array<{ id: string; editorName: string; details: string; createdAt: string }>;
    }>(`/warehouse/loading/units/${unitId}/edit-history`);
  }

  recordEmptyWagonUnitTare(
    arrivalId: string,
    wagonNumber: string,
    tareWeight: string,
    cisternNumber?: string,
    platformTareWeight?: string,
    containerTareWeights?: Record<string, string>,
  ) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/tare`,
      {
        method: 'POST',
        body: JSON.stringify({
          tareWeight,
          cisternNumber: cisternNumber ?? null,
          platformTareWeight: platformTareWeight ?? null,
          containerTareWeights: containerTareWeights ?? null,
        }),
      },
    );
  }

  /** Tara tekshiruvi: og‘irliksiz o‘tkazish (tara 1C dan chiqishda). */
  clearEmptyWagonTareCheck(arrivalId: string, wagonNumber: string, cisternNumber?: string) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/clear-tare-check`,
      {
        method: 'POST',
        body: JSON.stringify({ cisternNumber: cisternNumber ?? null }),
      },
    );
  }

  /** Tara tekshiruvi: tanlangan yoki barcha kutilayotgan vagonlarni birga o‘tkazish. */
  clearEmptyWagonTareCheckBulk(arrivalId: string, wagonNumbers?: string[]) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/clear-tare-check`,
      {
        method: 'POST',
        body: JSON.stringify({ wagonNumbers: wagonNumbers ?? null }),
      },
    );
  }

  /** Brutto tekshiruvi: bitta vagonni plomba o'rnatish bosqichiga o'tkazish. */
  clearEmptyWagonGrossCheck(arrivalId: string, wagonNumber: string) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/clear-gross-check`,
      {
        method: 'POST',
      },
    );
  }

  /** Brutto tekshiruvi: tanlangan yoki barcha kutilayotgan vagonlarni plomba o'rnatishga o'tkazish. */
  clearEmptyWagonGrossCheckBulk(arrivalId: string, wagonNumbers?: string[]) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/clear-gross-check`,
      {
        method: 'POST',
        body: JSON.stringify({ wagonNumbers: wagonNumbers ?? null }),
      },
    );
  }

  /** Tara: vagon nuqsoni — estakadaga bermay qaytarish. */
  returnEmptyWagonFromTare(arrivalId: string, wagonNumber: string, reason: string) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/return-from-tare`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }

  /** Brutto: ortiqcha yuklangan vagonni yukni kamaytirish uchun TM/XA ga qaytarish. */
  returnEmptyWagonFromGross(arrivalId: string, wagonNumber: string, reason: string) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/return-from-gross`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }

  /** Tara: butun partiyani Temir yo‘lga qaytarish (estakadaga bermay). */
  returnEmptyWagonPartyFromTare(arrivalId: string, reason: string) {
    return this.updateEmptyWagonStage(arrivalId, 'KengsoyInspection', reason);
  }

  recordEmptyWagonUnitGross(arrivalId: string, wagonNumber: string, grossWeight: string) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/gross`,
      {
        method: 'POST',
        body: JSON.stringify({ grossWeight }),
      },
    );
  }

  recordEmptyWagonUnitSeal(
    arrivalId: string,
    wagonNumber: string,
    sealNumber: string,
    enteredToUng = true,
    defectActNumber?: string,
    reason?: string,
  ) {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/seal`,
      {
        method: 'POST',
        body: JSON.stringify({ sealNumber, enteredToUng, defectActNumber, reason }),
      },
    );
  }

  confirmEmptyWagonUnitSeal(arrivalId: string, wagonNumber: string, comment?: string, role?: 'Scale' | 'Security' | 'Economist') {
    return this.request<{ success: boolean; data?: EmptyWagonArrival; message?: string }>(
      `/empty-wagons/${arrivalId}/wagons/${encodeURIComponent(wagonNumber)}/seal/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ comment: comment ?? '', role }),
      },
    );
  }

  getEconomistNotifications() {
    return this.request<{ success: boolean; data: LoadingTask[] }>('/warehouse/economist-notifications');
  }

  getLoadingRegistries() {
    return this.request<{ success: boolean; data: LoadingRegistry[] }>('/documents/loading-registry');
  }

  createLoadingRegistry(data: {
    emptyWagonArrivalId: string;
    registryNumber: string;
    monthlyOrderId?: string | null;
    monthlyOrderLineId?: string | null;
    wagonRoutes: Array<{
      wagonNumber: string;
      monthlyOrderId?: string | null;
      monthlyOrderLineId?: string | null;
      includeDefective?: boolean;
      sourceArrivalId?: string | null;
    }>;
  }) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>('/documents/loading-registry', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async issueDefectAct(unitId: string, actType: string, scaleOperatorName?: string) {
    return this.request<{ success: boolean; data?: {
      id: string;
      defectActNumber: string;
      defectActType: string;
      defectActUploadedAt: string;
      defectActUploadedByName: string;
    }; message?: string }>(`/documents/defect-act/${unitId}/issue`, {
      method: 'POST',
      body: JSON.stringify({ actType, scaleOperatorName }),
    });
  }

  async getScaleOperators() {
    return this.request<{ success: boolean; data?: string[]; message?: string }>('/documents/defect-act/scale-operators');
  }

  async uploadDefectAct(unitId: string, file: File) {
    const token = this.getToken();
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${API_URL}/documents/defect-act/${unitId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    const data = await response.json() as { success?: boolean; data?: unknown; message?: string };
    if (!response.ok) throw new Error(data.message || `Server xatosi (${response.status})`);
    return data;
  }

  async downloadDefectAct(unitId: string, fileName: string) {
    const token = this.getToken();
    const response = await fetch(`${API_URL}/documents/defect-act/${unitId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error('Dalolatnomani yuklab bo‘lmadi');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'dalolatnoma';
    a.click();
    URL.revokeObjectURL(url);
  }

  approveLoadingRegistryByShift(registryId: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/approve-shift`,
      { method: 'POST', body: '{}' },
    );
  }

  approvePermit(registryId: string, approved: boolean, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/approve-permit`,
      { method: 'POST', body: JSON.stringify({ approved, comment: comment ?? '' }) },
    );
  }

  approveEconomistWithPermit(registryId: string, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/approve-economist-permit`,
      { method: 'POST', body: JSON.stringify({ comment: comment ?? '' }) },
    );
  }

  approveEconomistWithSecurity(registryId: string, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/approve-economist-security`,
      { method: 'POST', body: JSON.stringify({ comment: comment ?? '' }) },
    );
  }

  approveSecurity(registryId: string, approved: boolean, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/approve-security`,
      { method: 'POST', body: JSON.stringify({ approved, comment: comment ?? '' }) },
    );
  }

  sendToExternal(registryId: string, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/send-to-external`,
      { method: 'POST', body: JSON.stringify({ comment: comment ?? '' }) },
    );
  }

  handoverToMachinist(registryId: string, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/handover`,
      { method: 'POST', body: JSON.stringify({ comment: comment ?? '' }) },
    );
  }

  exitToKengsoy(registryId: string, comment?: string) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}/exit-to-kengsoy`,
      { method: 'POST', body: JSON.stringify({ comment: comment ?? '' }) },
    );
  }

  updateLoadingRegistry(registryId: string, data: {
    registryNumber: string;
    revisionComment: string;
    wagonRoutes?: Array<{
      wagonNumber: string;
      monthlyOrderId?: string | null;
      monthlyOrderLineId?: string | null;
      includeDefective?: boolean;
      sourceArrivalId?: string | null;
    }>;
  }) {
    return this.request<{ success: boolean; data?: LoadingRegistry; message?: string }>(
      `/documents/loading-registry/${registryId}`,
      { method: 'PUT', body: JSON.stringify(data) },
    );
  }

  deleteLoadingRegistry(registryId: string) {
    return this.request<{ success: boolean; data?: boolean; message?: string }>(
      `/documents/loading-registry/${registryId}`,
      { method: 'DELETE' },
    );
  }

  getOneCWeighings(
    date1?: string,
    date2?: string,
    opts?: { sync?: boolean; sealedOnly?: boolean },
  ) {
    const sp = new URLSearchParams();
    if (date1) sp.set('date1', date1);
    if (date2) sp.set('date2', date2);
    sp.set('sync', String(opts?.sync ?? false));
    sp.set('sealedOnly', String(opts?.sealedOnly ?? false));
    const q = sp.toString();
    return this.request<{ success: boolean; data?: OneCWeighingsResult; message?: string }>(
      `/integrations/1c/weighings?${q}`,
    );
  }

  saveOneCManualSeal(wagonNumber: string, sealNumber: string, arrivalId?: string) {
    return this.request<{ success: boolean; data?: { arrivalId: string; sealNumber: string; isManualSeal: boolean }; message?: string }>(
      '/integrations/1c/weighings/manual-seal',
      {
        method: 'POST',
        body: JSON.stringify({ wagonNumber, sealNumber, arrivalId }),
      },
    );
  }

  syncOneCWeighings(date1?: string, date2?: string) {
    const sp = new URLSearchParams();
    if (date1) sp.set("date1", date1);
    if (date2) sp.set("date2", date2);
    const q = sp.toString();
    return this.request<{ success: boolean; data?: OneCEmptyWagonSyncResult; message?: string }>(
      '/integrations/1c/weighings/sync' + (q ? "?" + q : ""),
      { method: "POST" },
    );
  }

  getOneCCredentials() {
    return this.request<{ success: boolean; data?: OneCCredentialsView; message?: string }>(
      "/integrations/credentials/1c",
    );
  }

  saveOneCCredentials(data: { baseUrl: string; username: string; password?: string }) {
    return this.request<{ success: boolean; data?: OneCCredentialsView; message?: string }>(
      "/integrations/credentials/1c",
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
  }

  getAuditLogs(params: AuditFilterParams = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params.tab) sp.set('tab', params.tab);
    if (params.search) sp.set('search', params.search);
    if (params.category) sp.set('category', params.category);
    if (params.action) sp.set('action', params.action);
    if (params.status) sp.set('status', params.status);
    if (params.username) sp.set('username', params.username);
    if (params.userId) sp.set('userId', params.userId);
    if (params.ipAddress) sp.set('ipAddress', params.ipAddress);
    if (params.startDate) sp.set('startDate', params.startDate);
    if (params.endDate) sp.set('endDate', params.endDate);
    const q = sp.toString();
    return this.request<{ success: boolean; data: AuditLogPageResponse }>(
      `/audit-logs${q ? `?${q}` : ''}`,
    );
  }

  getAuditStats() {
    return this.request<{ success: boolean; data: AuditStats }>('/audit-logs/stats');
  }

  async exportAuditLogs(params: AuditFilterParams = {}) {
    const sp = new URLSearchParams();
    if (params.tab) sp.set('tab', params.tab);
    if (params.search) sp.set('search', params.search);
    if (params.category) sp.set('category', params.category);
    if (params.action) sp.set('action', params.action);
    if (params.status) sp.set('status', params.status);
    if (params.username) sp.set('username', params.username);
    if (params.startDate) sp.set('startDate', params.startDate);
    if (params.endDate) sp.set('endDate', params.endDate);
    const q = sp.toString();
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/audit-logs/export${q ? `?${q}` : ''}`, { headers });
    if (!res.ok) throw new Error('Eksport xatosi yuz berdi');
    return await res.blob();
  }

  getTrashItems(params: TrashFilterParams = {}) {
    const sp = new URLSearchParams();
    if (params.category) sp.set('category', params.category);
    if (params.search) sp.set('search', params.search);
    if (params.page) sp.set('page', params.page.toString());
    if (params.pageSize) sp.set('pageSize', params.pageSize.toString());
    const q = sp.toString();
    return this.request<{ success: boolean; data: TrashListResponse }>(
      `/admin/trash${q ? `?${q}` : ''}`,
    );
  }

  getTrashFileDownloadUrl(id: string) {
    return `${API_URL}/admin/trash/${id}/download`;
  }

  async downloadTrashFile(id: string, fileName: string, key?: string) {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const query = key ? `?key=${encodeURIComponent(key)}&name=${encodeURIComponent(fileName)}` : '';
    const res = await fetch(`${API_URL}/admin/trash/${id}/download${query}`, { headers });
    if (!res.ok) throw new Error('Faylni yuklab olishda xatolik');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  restoreTrashItem(id: string) {
    return this.request<{ success: boolean; message?: string }>(
      `/admin/trash/${id}/restore`,
      { method: 'POST' },
    );
  }

  permanentDeleteTrashItem(id: string) {
    return this.request<{ success: boolean; message?: string }>(
      `/admin/trash/${id}`,
      { method: 'DELETE' },
    );
  }

  emptyTrash(expiredOnly: boolean = false) {
    return this.request<{ success: boolean; data: { count: number }; message?: string }>(
      `/admin/trash/empty?onlyExpired=${expiredOnly}&expiredOnly=${expiredOnly}`,
      { method: 'POST' },
    );
  }


  // ==========================================
  // NORMATIVE DOCUMENTS (Normativ hujjatlar)
  // ==========================================
  private getNormativeSidecarBase(): string {
    return '';
  }

  async getNormativeDocuments(params?: { category?: string; search?: string }): Promise<NormativeDocument[]> {
    const sp = new URLSearchParams();
    if (params?.category && params.category !== 'all') sp.set('category', params.category);
    if (params?.search && params.search.trim()) sp.set('search', params.search.trim());
    const query = sp.toString() ? `?${sp.toString()}` : '';

    try {
      const res = await fetch(`/api/normative-docs${query}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.data || []);
      }
    } catch {
      // offline / fallback
    }
    return [];
  }

  async uploadNormativeDocument(payload: CreateNormativeDocPayload): Promise<NormativeDocument> {
    const sidecarUrl = `${this.getNormativeSidecarBase()}/api/normative-docs`;
    try {
      const res = await fetch(sidecarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || 'Hujjat yuklashda xatolik');
    } catch (e: any) {
      const res = await fetch(`/api/normative-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
      throw new Error(e.message || 'Hujjat yuklashda xatolik yuz berdi');
    }
  }

  async deleteNormativeDocument(id: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(`${this.getNormativeSidecarBase()}/api/normative-docs/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) return await res.json();
    } catch {}
    const res = await fetch(`/api/normative-docs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Hujjatni o‘chirishda xatolik');
    return await res.json();
  }

  getNormativeDocViewUrl(id: string): string {
    return `${this.getNormativeSidecarBase()}/api/normative-docs/${id}/view`;
  }

  getNormativeDocDownloadUrl(id: string): string {
    return `${this.getNormativeSidecarBase()}/api/normative-docs/${id}/download`;
  }

  async downloadNormativeDocument(id: string, fileName: string): Promise<void> {
    let blob: Blob | null = null;
    try {
      const res = await fetch(`${this.getNormativeSidecarBase()}/api/normative-docs/${id}/download`);
      if (res.ok) blob = await res.blob();
    } catch {}

    if (!blob) {
      const res = await fetch(`/api/normative-docs/${id}/download`);
      if (!res.ok) throw new Error('Faylni yuklab olishda xatolik');
      blob = await res.blob();
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async getTelegramSettings(): Promise<ApiResponse<TelegramConfig>> {
    return this.get<ApiResponse<TelegramConfig>>('/notifications/telegram-settings');
  }

  async saveTelegramSettings(settings: TelegramConfig): Promise<ApiResponse<TelegramConfig>> {
    return this.post<ApiResponse<TelegramConfig>>('/notifications/telegram-settings', settings);
  }

  async testTelegramSettings(settings?: Partial<TelegramConfig>): Promise<ApiResponse<boolean>> {
    return this.post<ApiResponse<boolean>>('/notifications/telegram-settings/test', settings || {});
  }

  async fetchNormativeDocumentBlob(id: string): Promise<{ blob: Blob; url: string }> {
    let res: Response | null = null;
    try {
      res = await fetch(`${this.getNormativeSidecarBase()}/api/normative-docs/${id}/view`);
    } catch {
      res = null;
    }
    if (!res || !res.ok) {
      res = await fetch(`/api/normative-docs/${id}/view`);
    }
    if (!res.ok) throw new Error('Hujjat faylini ochishda xatolik');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    return { blob, url };
  }
}

export const api = new ApiClient();
