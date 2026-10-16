export interface User {
  username: string;
  fullName: string;
  role: string;
  department: string;
  position: string;
  email: string;
  token: string;
  expiresAt: string;
  avatarUrl?: string;
  mustChangePassword?: boolean;
}

export interface NormativeDocument {
  Id: string;
  Title: string;
  DocumentNumber: string;
  DocumentDate?: string;
  Category: string; // 'law' | 'railway' | 'internal' | 'technical' or custom
  Description?: string;
  FileName: string;
  FileSize: number | string;
  MimeType: string;
  UploadedBy?: string;
  CreatedAt: string;
  UpdatedAt?: string;
  /** Fayl tahrirda almashtirilgan — statik namunaviy fayl o‘rniga brauzer xotirasidagisi ishlatiladi */
  LocalFile?: boolean;
}

export interface CreateNormativeDocPayload {
  title: string;
  documentNumber?: string;
  documentDate?: string;
  category: string;
  description?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileBase64?: string;
  uploadedBy?: string;
}

export interface MenuItem {
  key: string;
  label: string;
  path: string;
  icon: string;
  children?: MenuItem[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message?: string;
}

export interface DashboardStats {
  totalOrders: number;
  activePlans: number;
  activeShipments: number;
  completedShipments: number;
  pendingApprovals: number;
  wagonsInProcess: number;
  railwayOrders: number;
  roadOrders: number;
  railwayShipments: number;
  roadShipments: number;
}

export interface ServiceDetailItem {
  key: string;
  value: string;
}

export interface ServerSystemInfo {
  hostname: string;
  osDescription: string;
  architecture: string;
  cpuCores: number;
  systemUptime: string;
  apiUptime?: string;
  sslCertExpire?: string;
  domain?: string;
  dotnetVersion: string;
  serverTime: string;
}

export interface ServerMetrics {
  cpuPercent: number;
  cpuCores?: number;
  cpuAvgLoad?: number;
  ramPercent: number;
  ramUsedGb: number;
  ramFreeGb?: number;
  ramTotalGb: number;
  diskPercent: number;
  diskFreeGb: number;
  diskUsedGb?: number;
  diskTotalGb: number;
  trafficPercent: number;
  trafficIncomingMb?: number;
  trafficOutgoingMb?: number;
  trafficMbPerSec?: number;
}

export interface ServerServiceStatus {
  key: string;
  label: string;
  isHealthy: boolean;
  message?: string | null;
  latencyMs?: number;
  port?: string;
  type?: string;
  version?: string;
  details?: ServiceDetailItem[];
}

export interface ServerStatus {
  timestamp: string;
  systemInfo?: ServerSystemInfo;
  metrics: ServerMetrics;
  services: ServerServiceStatus[];
}

export interface MonthlyOrderLine {
  id: string;
  sortOrder: number;
  contractor: string;
  wagonCount: number;
  tonCount: number;
  quantityUnit: string;
  wagonNumbers: string;
  destinationStation: string;
  lastLoadingDate: string | null;
  accountantSigned: boolean;
  weigherSigned: boolean;
  accountingStatus: string;
  accountingReviewChecked?: boolean | null;
  fulfilledWagonCount?: number;
  fulfilledNetWeight?: number;
  remainingWagonCount?: number;
  remainingTonCount?: number;
  /** Ixtiyoriy: shu qator shartnomasi */
  contractNumber?: string;
  /** Ixtiyoriy: mahsulot markasi */
  productGrade?: string;
  /** Hujjatdagi (kontragent) buyurtma raqami — tizimdagi hujjat raqamidan alohida */
  customerOrderNumber?: string;
  /** Yuk xatlari bo‘yicha jo‘natilgan vagonlar — stansiya kesimida (serverda hisoblanadi) */
  stationShipments?: Array<{ station: string; wagons: number; netTons: number }> | null;
}

export interface OrderAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface MonthlyOrder {
  id: string;
  orderNumber: string;
  logisticsType: string;
  contractNumber: string;
  productType: string;
  productGrade?: string;
  year: number;
  month: number;
  deadline: string;
  status: string;
  createdBy: string;
  createdAt: string;
  accountingApproverName: string;
  marketingApproverName: string;
  deputyApproverName: string;
  dispatchApproverName: string;
  lines: MonthlyOrderLine[];
  totalWagons: number;
  totalTons: number;
  attachments: OrderAttachment[];
  submittedAt?: string | null;
  approvedAt?: string | null;
  submittedToDispatchAt?: string | null;
  dispatchApprovedAt?: string | null;
  marketingApprovedAt?: string | null;
  deputyApprovedAt?: string | null;
  qrGlobalId?: string;
  qrVerificationUrl?: string;
  qrCodeBase64?: string;
  qrRegisteredAt?: string | null;
  manuallyCompleted?: boolean;
  /** MS va MX ichki ko'rigi: '' | 'Pending' (bo'lim boshlig'ida) | 'Returned' | 'Approved' */
  headReviewStatus?: string;
  headSubmittedAt?: string | null;
  headSubmittedByName?: string;
  headApprovedAt?: string | null;
  headApprovedByName?: string;
  headReturnComment?: string;
  manuallyCompletedAt?: string | null;
  manuallyCompletedByName?: string;
  manualCompletionReason?: string;
}

export interface MonthlyOrderLineInput {
  id?: string;
  sortOrder: number;
  contractor: string;
  wagonCount: number;
  tonCount: number;
  quantityUnit: string;
  wagonNumbers: string;
  destinationStation: string;
  lastLoadingDate?: string | null;
  contractNumber?: string;
  productGrade?: string;
  customerOrderNumber?: string;
}

export interface Contractor {
  id: string;
  name: string;
  inn?: string;
  logisticsType: string;
  isSystem: boolean;
  createdAt: string;
}

export interface ContractorDestination {
  id: string;
  contractorName: string;
  logisticsType: string;
  stationName: string;
  isSystem: boolean;
  createdAt: string;
}

export interface DailyPlanLine {
  id: string;
  monthlyOrderLineId: string;
  contractor: string;
  destinationStation: string;
  plannedWagons: number;
}

export interface DailyPlan {
  id: string;
  planNumber: string;
  monthlyOrderId: string | null;
  orderNumber: string | null;
  productType: string | null;
  planDate: string;
  plannedWagons: number;
  plannedAmount: number;
  notes: string;
  status: string;
  createdBy: string;
  createdAt: string;
  lines: DailyPlanLine[];
}

export interface OrderLinePlanBalance {
  lineId: string;
  contractor: string;
  destinationStation: string;
  orderedWagons: number;
  plannedWagons: number;
  remainingWagons: number;
}

export interface OrderPlanBalance {
  orderId: string;
  orderNumber: string;
  productType: string;
  logisticsType: string;
  year: number;
  month: number;
  status: string;
  totalOrdered: number;
  totalPlanned: number;
  totalRemaining: number;
  lines: OrderLinePlanBalance[];
}

/** Estakadaga qo‘yilgan vagonlar fondi — yuklash taqsimoti cheklovi. */
export interface PlanWagonAvailability {
  productType: string;
  tareReadyWagons: number;
  reservedUnfilled: number;
  availableToAllocate: number;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  productType: string;
  status: string;
  destinationStation: string;
  wagonCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ShipmentDetail extends Shipment {
  wagons: Wagon[];
  statusHistory: StatusHistory[];
}

export interface Wagon {
  id: string;
  wagonNumber: string;
  cisternNumber: string;
  isInspected: boolean;
  isLoaded: boolean;
  sealNumber: string;
  weighing: WeighingRecord | null;
}

export interface WeighingRecord {
  tareWeight: number;
  grossWeight: number;
  netWeight: number;
  weighedAt: string;
}

export interface StatusHistory {
  fromStatus: string;
  toStatus: string;
  comment: string;
  changedBy: string;
  changedAt: string;
}

export interface DispatchJournalEntry {
  id: string;
  shipmentId: string;
  entry: string;
  recordedBy: string;
  recordedAt: string;
}

export interface AdminUserProfile {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  department: string;
  position: string;
  departmentShortName: string;
  avatarUrl?: string;
  mustChangePassword?: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  logisticsType: string;
  orderPrefix: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface CatalogWagonType {
  id: string;
  name: string;
  code?: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface CatalogFleetWagon {
  id: string;
  wagonNumber: string;
  ownership: string;
  wagonKind?: string | null;
  isActive: boolean;
  notes?: string | null;
  serviceability?: string | null;
  builtAt?: string | null;
  lastCapitalRepairAt?: string | null;
  lastDepotRepairAt?: string | null;
  daysUntilNextDepotRepair?: number | null;
  destinationStation?: string | null;
  sentAt?: string | null;
  daysInTransit?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogContainer {
  id: string;
  containerNumber: string;
  builtAt?: string | null;
  nextInspectionAt?: string | null;
  daysUntilNextInspection?: number | null;
  destinationStation?: string | null;
  sentAt?: string | null;
  daysInTransit?: number | null;
  notes?: string | null;
  serviceability?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerImportRow {
  containerNumber: string;
  builtAt?: string;
  nextInspectionAt?: string;
  daysUntilNextInspection?: number;
  destinationStation?: string;
  sentAt?: string;
  daysInTransit?: number;
  notes?: string;
}

export interface ContainerImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface FleetWagonImportRow {
  wagonNumber: string;
  ownership?: string;
  builtAt?: string;
  lastCapitalRepairAt?: string;
  lastDepotRepairAt?: string;
  daysUntilNextDepotRepair?: number;
  destinationStation?: string;
  sentAt?: string;
  daysInTransit?: number;
  notes?: string;
}

export interface FleetWagonImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface FleetWagonLookup {
  wagonNumber: string;
  ownership: string | null;
  found: boolean;
}

export interface CatalogStation {
  id: string;
  name: string;
  code?: string;
  logisticsType: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface EmptyWagonUnit {
  id: string;
  /** Client-side provenance used when several arrival parties are merged. */
  emptyWagonArrivalId?: string;
  wagonNumber: string;
  cisternNumber: string;
  wagonType?: string;
  ownership?: string;
  intakeLoadState?: string;
  productType?: string;
  status: string;
  tareWeight: string;
  platformTareWeight?: string;
  containerTareWeights?: string;
  grossWeight: string;
  nettoWeight?: string | null;
  loadingComment: string;
  loadingBatchNumber?: string;
  loadingStartedAt?: string | null;
  loadingCompletedAt?: string | null;
  loadingCompletedByName?: string;
  tareWeighedAt?: string | null;
  tareCheckedAt?: string | null;
  grossWeighedAt?: string | null;
  sortOrder: number;
  sealNumber?: string;
  sealedAt?: string | null;
  sealEnteredToUngAt?: string | null;
  sealConfirmedByScaleAt?: string | null;
  sealConfirmedByScaleName?: string;
  sealConfirmedBySecurityAt?: string | null;
  sealConfirmedBySecurityName?: string;
  sealConfirmedByEconomistAt?: string | null;
  sealConfirmedByEconomistName?: string;
  scaleExitedAt?: string | null;
  defectActNumber?: string;
  defectActType?: string;
  defectActFileName?: string;
  defectActUploadedAt?: string | null;
  defectActUploadedByName?: string;
  defectActQrGlobalId?: string;
  defectActQrVerificationUrl?: string;
  defectActQrCodeBase64?: string;
  defectActQrRegisteredAt?: string | null;
}

export interface EmptyWagonArrival {
  id: string;
  arrivalNumber: string;
  arrivalDate: string;
  wagonCount: number;
  wagonNumbers: string;
  cisternNumbers: string;
  productType: string;
  trackNumber: string;
  notifiedDepartments: string[];
  preparedDepartments: string[];
  stage?: string;
  tareWeight?: string;
  grossWeight?: string;
  verifiedWagonNumbers?: string;
  notes: string;
  createdByName: string;
  createdAt: string;
  loadingComment?: string;
  loadingCompletedByName?: string;
  loadingCompletedAt?: string | null;
  economistNotifiedAt?: string | null;
  dailyPlanId?: string | null;
  planNumber?: string;
  wagons?: EmptyWagonUnit[];
  entryPermitNumber?: string;
  entryPermitShiftApprovedAt?: string | null;
  entryPermitShiftApprovedByName?: string;
  entryPermitPermitApprovedAt?: string | null;
  entryPermitPermitApprovedByName?: string;
  entryPermitSecurityApprovedAt?: string | null;
  entryPermitSecurityApprovedByName?: string;
  entryPermitQrGlobalId?: string;
  entryPermitQrVerificationUrl?: string;
  entryPermitQrCodeBase64?: string;
  entryPermitQrRegisteredAt?: string | null;
}

export interface LoadingTask {
  id: string;
  arrivalNumber: string;
  arrivalDate: string;
  wagonCount: number;
  wagonNumbers: string;
  cisternNumbers: string;
  productType: string;
  trackNumber: string;
  stage: string;
  tareWeight: string;
  grossWeight?: string;
  loadingComment: string;
  loadingCompletedByName: string;
  loadingCompletedAt: string | null;
  economistNotifiedAt: string | null;
  createdByName: string;
  createdAt: string;
  dailyPlanId?: string | null;
  planNumber?: string;
  wagons?: EmptyWagonUnit[];
}

export interface LoadingRegistry {
  id: string;
  emptyWagonArrivalId: string;
  arrivalNumber: string;
  productType: string;
  wagonCount: number;
  registryNumber: string;
  isApprovedByEconomist: boolean;
  economistApprovedAt: string | null;
  isEconomistApprovedWithPermit: boolean;
  economistApprovedWithPermitAt: string | null;
  isEconomistApprovedWithSecurity: boolean;
  economistApprovedWithSecurityAt: string | null;
  isApprovedByPermit: boolean;
  isApprovedBySecurity: boolean;
  permitCheckResult: string;
  securityCheckResult: string;
  lastRevisionComment: string;
  revisedAt: string | null;
  isSentToOneC: boolean;
  isSentToENakl: boolean;
  sentToOneCAt: string | null;
  sentToENaklAt: string | null;
  handoverToMachinistAt: string | null;
  exitedToKengsoyAt: string | null;
  exitedToKengsoyByName?: string;
  preparedAt: string;
  preparedByName?: string;
  economistApprovedByName?: string;
  permitApprovedByName?: string;
  securityApprovedByName?: string;
  permitApprovedAt?: string | null;
  securityApprovedAt?: string | null;
  monthlyOrderId?: string | null;
  monthlyOrderLineId?: string | null;
  orderNumber: string;
  contractNumber: string;
  contractorName: string;
  destinationStation: string;
  isApprovedByShiftSupervisor: boolean;
  shiftSupervisorApprovedAt?: string | null;
  shiftSupervisorApprovedByName?: string;
  wagonRoutes: Array<{
    wagonNumber: string;
    monthlyOrderLineId: string;
    contractorName: string;
    destinationStation: string;
    isDefective?: boolean;
    defectReason?: string;
    defectActFileName?: string;
    monthlyOrderId?: string | null;
    orderNumber?: string;
    productType?: string;
    sourceArrivalId?: string | null;
    sourceArrivalNumber?: string;
    tareWeight?: string;
    grossWeight?: string;
    nettoWeight?: string;
    netWeight?: number | string;
    NetWeight?: number | string;
    sealNumber?: string;
    /** Vagon bog‘langan buyurtma qatorining shartnoma raqami */
    contractNumber?: string;
  }>;
  orderDeductedWagons?: number;
  orderDeductedNetWeight?: number;
  qrGlobalId?: string;
  qrVerificationUrl?: string;
  qrCodeBase64?: string;
  qrRegisteredAt?: string | null;
  /** Qo‘riqlashdan keyin qabul qiluvchilar bo‘yicha ajratmalar (WB-…-1, -2) va ularning QR'i */
  waybillParts?: WaybillPartQr[] | null;
}

export interface WaybillPartQr {
  partNo: number;
  number: string;
  contractNumber: string;
  receiver: string;
  qrGlobalId: string;
  qrVerificationUrl: string;
  qrCodeBase64: string;
  qrRegisteredAt?: string | null;
}

export const ROLE_LABELS: Record<string, string> = {
  Admin: 'Administrator',
  Marketing: 'MS va MX bo‘lim boshlig‘i',
  MarketingStaff: 'MS va MX xodimi',
  Dispatching: 'ICHDX smena boshlig\'i',
  DispatchSupervisor: 'ICHDX boshlig\'i',
  Accounting: 'Buxgalteriya',
  Railway: 'Temir yo\'l sexi',
  Road: 'Avtotransport',
  Warehouse: 'TM va XA smena muxandisi',
  Scale: 'Tarozi operatori',
  Permit: 'Ruxsatnoma byurosi',
  Security: 'Qo\'riqlash xizmati',
  Economist: 'ICHDX iqtisodchisi',
  Management: 'Rahbariyat',
  DeputyDirector: 'Bosh direktor o\'rinbosari',
};

export const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  Active: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  Approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  PendingMarketing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  PendingAccounting: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  PendingMsMx: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  PendingRailway: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  PendingWarehouse: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  PendingSecurity: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  ReturnedToMarketing: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  ReadyForDispatch: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  PendingDispatching: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  Created: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  Loaded: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  Weighed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  SecurityChecked: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  SecurityMismatch: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  Dispatched: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
};

export interface OneCWeighingItem {
  isManualSeal?: boolean;
  arrivalId?: string;
  isExited?: boolean;
  isOnSite?: boolean;
  exitedAt?: string | null;
  hasRegistry?: boolean;
  registryNumber?: string | null;
  datetimeIn: string;
  datetimeOut: string;
  wagonNumber: string;
  wagonCapacityM3: string;
  stampNumber: string;
  productName: string;
  invoiceNumber: string;
  tara: number;
  brutto: number;
  netto: number;
  vehicleId: string;
  confidantName: string;
  vidVesi: string;
  weigherName: string;
  channel: 'railway' | 'auto' | 'other' | string;
}

export interface OneCWeighingsResult {
  items: OneCWeighingItem[];
  railwayCount: number;
  autoCount: number;
  date1: string;
  date2: string;
  fetchedAt: string;
  sync?: OneCEmptyWagonSyncResult | null;
}

export interface OneCSyncAppliedItem {
  wagonNumber: string;
  stampNumber: string;
  arrivalNumber: string;
  tareTn: string;
  grossTn: string;
  datetimeOut?: string | null;
  action: string;
}

export interface OneCEmptyWagonSyncResult {
  fetchedRailway: number;
  sealedCandidates: number;
  updated: number;
  skippedNoMatch: number;
  skippedUnchanged: number;
  applied: OneCSyncAppliedItem[];
  unmatchedWagons: string[];
  syncedAt: string;
}

export interface OneCCredentialsView {
  baseUrl: string;
  username: string;
  passwordConfigured: boolean;
  source: string;
  updatedAt?: string | null;
}

export interface AuditLogItem {
  id: string;
  userId?: string;
  username: string;
  userFullName: string;
  userRole: string;
  userPosition: string;
  userDepartment: string;
  ipAddress: string;
  userAgent: string;
  action: string;
  category: string;
  status: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface AuditLogPageResponse {
  items: AuditLogItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditStats {
  totalLogs: number;
  successCount: number;
  warningCount: number;
  failedCount: number;
  authCount?: number;
  orderCount?: number;
  weighingCount?: number;
  loadingCount?: number;
  documentsCount?: number;
  intakeCount?: number;
  totalTrend?: string;
  successTrend?: string;
  warningTrend?: string;
  failedTrend?: string;
}

export interface AuditFilterParams {
  page?: number;
  pageSize?: number;
  tab?: string;
  search?: string;
  category?: string;
  action?: string;
  status?: string;
  username?: string;
  userId?: string;
  ipAddress?: string;
  startDate?: string;
  endDate?: string;
}

export interface DocumentNumberingRule {
  documentType: string;
  title: string;
  prefix: string;
  periodFormat: 'MMYY' | 'YYMM' | 'YYYY';
  sequenceDigits: number;
  resetPeriod: 'Monthly' | 'Yearly';
  examplePreview: string;
  description?: string;
  isEditable: boolean;
}

export interface TrashItem {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  category: string;
  relatedNumber: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  hasFile: boolean;
  deletedByName: string;
  deletedByRole: string;
  deletedAt: string;
  deleteReason: string;
  expiresAt: string;
  daysRemaining: number;
  isRestored: boolean;
  payloadJson?: string;
}

export interface TrashStats {
  totalCount: number;
  attachmentCount: number;
  wagonCount: number;
  arrivalCount: number;
  orderCount: number;
  totalSizeBytes: number;
  expiringSoonCount: number;
}

export interface TrashListResponse {
  items: TrashItem[];
  stats: TrashStats;
  totalItems: number;
  page: number;
  pageSize: number;
}

export interface TrashFilterParams {
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}




export interface MonthlyPlanItem {
  id: string;
  year: number;
  month: number;
  factoryName: string;
  productType: string;
  planTons: number;
  actualTons: number;
  remainingTons: number;
  percentTons: number;
  planWagons: number;
  actualWagons: number;
  remainingWagons: number;
  percentWagons: number;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

export interface MonthlyPlansOverview {
  year: number;
  month: number;
  totalPlanTons: number;
  totalActualTons: number;
  totalRemainingTons: number;
  overallPercentTons: number;
  totalPlanWagons: number;
  totalActualWagons: number;
  totalRemainingWagons: number;
  overallPercentWagons: number;
  daysInMonth: number;
  daysPassed: number;
  daysRemaining: number;
  dailyTargetTons: number;
  items: MonthlyPlanItem[];
  dailyTrend: Array<{ day: number; actualTons: number; actualWagons: number }>;
}
