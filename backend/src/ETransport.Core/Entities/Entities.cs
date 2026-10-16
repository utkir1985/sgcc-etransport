namespace ETransport.Core.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = Constants.UserRoles.Marketing;
    public string Department { get; set; } = string.Empty;
    public string DepartmentShortName { get; set; } = string.Empty;
    public string Position { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public bool MustChangePassword { get; set; } = false;
    /// <summary>
    /// Sessiya versiyasi. Rol, parol yoki faollik o‘zgarganda oshiriladi va shu paytgacha
    /// berilgan kirish tokenlari darhol kuchini yo‘qotadi.
    /// </summary>
    public int TokenVersion { get; set; }
    /// <summary>Ketma-ket xato login urinishlari soni — muvaffaqiyatli kirishda 0 ga tushadi.</summary>
    public int FailedLoginAttempts { get; set; }
    /// <summary>Shu vaqtgacha hisob vaqtincha bloklangan (qo‘pol kuch hujumidan himoya).</summary>
    public DateTime? LockoutEnd { get; set; }
}

public enum OrderStatus
{
    Draft = 0,
    Active = 1,
    Completed = 2,
    Cancelled = 3,
    PendingAccounting = 4,
    ReturnedToMarketing = 5,
    ReadyForDispatch = 6,
    PendingDispatching = 7,
    /// <summary>Buxgalteriya kelishgan, ishlab chiqarish bo‘yicha o‘rinbosari kelishuvida.</summary>
    PendingDeputyDirector = 8,
}
public enum PlanStatus
{
    Draft = 0,
    PendingMsMx = 1,
    PendingRailway = 2,
    Approved = 3,
    Rejected = 4,
    PendingWarehouse = 5,
    PendingSecurity = 6
}
public enum ShipmentStatus
{
    Created = 0, WagonsReceived = 1, Inspected = 2, Loading = 3, Loaded = 4,
    Weighed = 5, Sealed = 6, RegistryPrepared = 7, SecurityChecked = 8,
    SecurityMismatch = 9, DocumentsIssued = 10, Exited = 11, AtStation = 12,
    Dispatched = 13, Completed = 14
}

public class MonthlyOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OrderNumber { get; set; } = string.Empty;
    public string LogisticsType { get; set; } = Constants.LogisticsTypes.Railway;
    public string ContractNumber { get; set; } = string.Empty;
    public string ProductType { get; set; } = string.Empty;
    public string ProductGrade { get; set; } = string.Empty;
    public int Year { get; set; }
    public int Month { get; set; }
    public DateTime Deadline { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Draft;
    public Guid CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAt { get; set; }
    public Guid? SubmittedById { get; set; }
    public User? SubmittedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public Guid? ApprovedByAccountingId { get; set; }
    public User? ApprovedByAccounting { get; set; }
    public DateTime? SubmittedToDispatchAt { get; set; }
    public Guid? SubmittedToDispatchById { get; set; }
    public User? SubmittedToDispatchBy { get; set; }
    public DateTime? DispatchApprovedAt { get; set; }
    public Guid? ApprovedByDispatchId { get; set; }
    public User? ApprovedByDispatch { get; set; }
    public string AccountingApproverName { get; set; } = string.Empty;
    public DateTime? MarketingApprovedAt { get; set; }
    public Guid? ApprovedByMarketingId { get; set; }
    public User? ApprovedByMarketing { get; set; }
    public string MarketingApproverName { get; set; } = string.Empty;
    public string DeputyApproverName { get; set; } = string.Empty;
    public DateTime? DeputyApprovedAt { get; set; }
    public Guid? ApprovedByDeputyId { get; set; }
    public User? ApprovedByDeputy { get; set; }
    public string DispatchApproverName { get; set; } = string.Empty;
    public string QrGlobalId { get; set; } = string.Empty;
    public string QrVerificationUrl { get; set; } = string.Empty;
    public string QrCodeBase64 { get; set; } = string.Empty;
    public DateTime? QrRegisteredAt { get; set; }
    // Qoldig‘i bo‘lsa ham qo‘lda yopilgan buyurtma — qayta hisoblashda «Ijroda»ga qaytmaydi
    // MS va MX ichki ko'rigi: xodim tayyorlaydi → bo'lim boshlig'i tasdiqlab kelishuvga yuboradi.
    // "" — ko'rik yo'q, "Pending" — boshliqda, "Returned" — xodimga qaytarilgan. Umumiy holat (Status) Draft'da qoladi.
    public string HeadReviewStatus { get; set; } = string.Empty;
    public DateTime? HeadSubmittedAt { get; set; }
    public string HeadSubmittedByName { get; set; } = string.Empty;
    public DateTime? HeadApprovedAt { get; set; }
    public string HeadApprovedByName { get; set; } = string.Empty;
    public string HeadReturnComment { get; set; } = string.Empty;
    public bool ManuallyCompleted { get; set; }
    public DateTime? ManuallyCompletedAt { get; set; }
    public string ManuallyCompletedByName { get; set; } = string.Empty;
    public string ManualCompletionReason { get; set; } = string.Empty;
    public ICollection<MonthlyOrderLine> Lines { get; set; } = [];
    public ICollection<DailyPlan> DailyPlans { get; set; } = [];
    public ICollection<OrderAttachment> Attachments { get; set; } = [];
}

public class OrderAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MonthlyOrderId { get; set; }
    public MonthlyOrder? MonthlyOrder { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string ObjectKey { get; set; } = string.Empty;
    public Guid UploadedById { get; set; }
    public User? UploadedBy { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}

public class MonthlyOrderLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MonthlyOrderId { get; set; }
    public MonthlyOrder? MonthlyOrder { get; set; }
    public int SortOrder { get; set; }
    public string Contractor { get; set; } = string.Empty;
    public int WagonCount { get; set; }
    /// <summary>Tonna miqdori (vagon sonidan hisoblanishi mumkin).</summary>
    public decimal TonCount { get; set; }
    /// <summary>Yuk xatlari orqali amalda bajarilgan vagonlar soni.</summary>
    public int FulfilledWagonCount { get; set; }
    /// <summary>Yuk xatlari orqali amalda jo‘natilgan sof mahsulot og‘irligi, tonna.</summary>
    public decimal FulfilledNetWeight { get; set; }
    public string QuantityUnit { get; set; } = Constants.OrderQuantityUnits.Wagon;
    public string WagonNumbers { get; set; } = string.Empty;
    /// <summary>Ixtiyoriy: bo‘sh bo‘lsa stansiya yuk xati tuzilganda tanlanadi.</summary>
    public string DestinationStation { get; set; } = string.Empty;
    /// <summary>Ixtiyoriy: bo‘sh bo‘lsa yuklash muddati cheklanmaydi.</summary>
    public DateTime? LastLoadingDate { get; set; }
    /// <summary>Ixtiyoriy: shu kontragent bilan tuzilgan shartnoma raqami.</summary>
    public string ContractNumber { get; set; } = string.Empty;
    /// <summary>Hujjatdagi (kontragent) buyurtma raqami — tizimdagi Buyurtma ID dan alohida.</summary>
    public string CustomerOrderNumber { get; set; } = string.Empty;
    /// <summary>Ixtiyoriy: mahsulot markasi (masalan, polietilen B-Y250).</summary>
    public string ProductGrade { get; set; } = string.Empty;
    public string AccountingStatus { get; set; } = Constants.LineAccountingStatuses.Pending;
    public bool? AccountingReviewChecked { get; set; }
    public bool AccountantSigned { get; set; }
    public bool WeigherSigned { get; set; }
}

public class DailyPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string PlanNumber { get; set; } = string.Empty;
    public Guid? MonthlyOrderId { get; set; }
    public MonthlyOrder? MonthlyOrder { get; set; }
    public DateTime PlanDate { get; set; }
    public int PlannedWagons { get; set; }
    public decimal PlannedAmount { get; set; }
    public string Notes { get; set; } = string.Empty;
    public PlanStatus Status { get; set; } = PlanStatus.Draft;
    public Guid CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public Guid? ApprovedByMarketingId { get; set; }
    public Guid? ApprovedByAccountingId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<DailyPlanLine> Lines { get; set; } = [];
    public ICollection<Shipment> Shipments { get; set; } = [];
}

/// <summary>Kunlik rejadagi hudud (buyurtma qatori) bo‘yicha vagon taqsimoti.</summary>
public class DailyPlanLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DailyPlanId { get; set; }
    public DailyPlan? DailyPlan { get; set; }
    public Guid MonthlyOrderLineId { get; set; }
    public MonthlyOrderLine? MonthlyOrderLine { get; set; }
    public int PlannedWagons { get; set; }
    public string Contractor { get; set; } = string.Empty;
    public string DestinationStation { get; set; } = string.Empty;
}

public class Shipment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ShipmentNumber { get; set; } = string.Empty;
    public Guid? DailyPlanId { get; set; }
    public DailyPlan? DailyPlan { get; set; }
    public string ProductType { get; set; } = string.Empty;
    public string LogisticsType { get; set; } = Constants.LogisticsTypes.Railway;
    public ShipmentStatus Status { get; set; } = ShipmentStatus.Created;
    public string DestinationStation { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public ICollection<Wagon> Wagons { get; set; } = [];
    public ICollection<ShipmentStatusHistory> StatusHistory { get; set; } = [];
}

public class ShipmentStatusHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShipmentId { get; set; }
    public Shipment? Shipment { get; set; }
    public ShipmentStatus FromStatus { get; set; }
    public ShipmentStatus ToStatus { get; set; }
    public string Comment { get; set; } = string.Empty;
    public Guid ChangedById { get; set; }
    public User? ChangedBy { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}

public class Wagon
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShipmentId { get; set; }
    public Shipment? Shipment { get; set; }
    public string WagonNumber { get; set; } = string.Empty;
    public string CisternNumber { get; set; } = string.Empty;
    public bool IsInspected { get; set; }
    public bool IsLoaded { get; set; }
    public string SealNumber { get; set; } = string.Empty;
    public WeighingRecord? WeighingRecord { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class WeighingRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WagonId { get; set; }
    public Wagon? Wagon { get; set; }
    public decimal TareWeight { get; set; }
    public decimal GrossWeight { get; set; }
    public decimal NetWeight => GrossWeight - TareWeight;
    public Guid OperatorId { get; set; }
    public User? Operator { get; set; }
    public DateTime WeighedAt { get; set; } = DateTime.UtcNow;
}

public class DispatchJournal
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShipmentId { get; set; }
    public Shipment? Shipment { get; set; }
    public string Entry { get; set; } = string.Empty;
    public Guid RecordedById { get; set; }
    public User? RecordedBy { get; set; }
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

public class ShippingRegistry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShipmentId { get; set; }
    public Shipment? Shipment { get; set; }
    public string RegistryNumber { get; set; } = string.Empty;
    public bool IsApprovedByPermit { get; set; }
    public bool IsApprovedBySecurity { get; set; }
    public string SecurityCheckResult { get; set; } = string.Empty;
    public Guid PreparedById { get; set; }
    public User? PreparedBy { get; set; }
    public DateTime PreparedAt { get; set; } = DateTime.UtcNow;

}

/// <summary>
/// TM va XA yuklash tugagandan keyin ICHDX tayyorlaydigan “Yuk xati” (reyestr) — MVP uchun EmptyWagonArrival bilan bog'langan.
/// </summary>
public class LoadingRegistry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EmptyWagonArrivalId { get; set; }
    public EmptyWagonArrival? EmptyWagonArrival { get; set; }

    public string RegistryNumber { get; set; } = string.Empty;
    public Guid PreparedById { get; set; }
    public User? PreparedBy { get; set; }
    public string PreparedByName { get; set; } = string.Empty;
    public DateTime PreparedAt { get; set; } = DateTime.UtcNow;

    // Yuk xati tuzilayotgan paytdagi buyurtma va yo'nalish nusxasi.
    public Guid? MonthlyOrderId { get; set; }
    public Guid? MonthlyOrderLineId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string ContractNumber { get; set; } = string.Empty;
    public string ContractorName { get; set; } = string.Empty;
    public string DestinationStation { get; set; } = string.Empty;
    /// <summary>Har bir vagonga buyurtma satri (kontragent/stansiya) biriktirilgan JSON nusxa.</summary>
    public string WagonRoutesJson { get; set; } = "[]";
    /// <summary>Ushbu yuk xati buyurtmadan hisobga olgan vagonlar va netto, qayta hisoblash/audit uchun.</summary>
    public int OrderDeductedWagons { get; set; }
    public decimal OrderDeductedNetWeight { get; set; }
    public bool IsApprovedByShiftSupervisor { get; set; }
    public DateTime? ShiftSupervisorApprovedAt { get; set; }
    public string ShiftSupervisorApprovedByName { get; set; } = string.Empty;

    // ICHDX iqtisodchisi reyestrni tekshirib kelishadi
    public bool IsApprovedByEconomist { get; set; }
    public DateTime? EconomistApprovedAt { get; set; }
    public string EconomistApprovedByName { get; set; } = string.Empty;
    public bool IsEconomistApprovedWithPermit { get; set; }
    public DateTime? EconomistApprovedWithPermitAt { get; set; }
    public bool IsEconomistApprovedWithSecurity { get; set; }
    public DateTime? EconomistApprovedWithSecurityAt { get; set; }

    public bool IsApprovedByPermit { get; set; }
    public bool IsApprovedBySecurity { get; set; }
    public DateTime? PermitApprovedAt { get; set; }
    public DateTime? SecurityApprovedAt { get; set; }
    public string PermitApprovedByName { get; set; } = string.Empty;
    public string SecurityApprovedByName { get; set; } = string.Empty;
    public string PermitCheckResult { get; set; } = string.Empty;
    public string SecurityCheckResult { get; set; } = string.Empty;

    /// <summary>ICHDX iqtisodchisi yuk xatini qayta tahrirlaganda majburiy izoh.</summary>
    public string LastRevisionComment { get; set; } = string.Empty;
    public DateTime? RevisedAt { get; set; }

    // 1C / e-nakl integratsiyasi (MVP stub)
    public bool IsSentToOneC { get; set; }
    public bool IsSentToENakl { get; set; }
    public DateTime? SentToOneCAt { get; set; }
    public DateTime? SentToENaklAt { get; set; }

    // Kelishilgan yuk xatini Temir yo‘lga topshirish
    public DateTime? HandoverToMachinistAt { get; set; }

    // Temir yo‘l vagonlarni zavod hududidan Kengsoygacha olib chiqishi
    public DateTime? ExitedToKengsoyAt { get; set; }
    public string ExitedToKengsoyByName { get; set; } = string.Empty;

    // Markaziy QR Link tizimi integratsiyasi
    public string QrGlobalId { get; set; } = string.Empty;
    public string QrVerificationUrl { get; set; } = string.Empty;
    public string QrCodeBase64 { get; set; } = string.Empty;
    public DateTime? QrRegisteredAt { get; set; }
    public string QrFinalFileHash { get; set; } = string.Empty;
}

/// <summary>Normativ hujjat (qonun, qoida, yo'riqnoma, reglament) — fayli bazada saqlanadi.</summary>
public class NormativeDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string? DocumentNumber { get; set; }
    public string? DocumentDate { get; set; }
    public string Category { get; set; } = "internal";
    public string? Description { get; set; }
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string MimeType { get; set; } = "application/pdf";
    public byte[]? FileData { get; set; }
    public string? UploadedBy { get; set; }
    public DateTime? CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string UserFullName { get; set; } = string.Empty;
    public string UserRole { get; set; } = string.Empty;
    public string UserPosition { get; set; } = string.Empty;
    public string UserDepartment { get; set; } = string.Empty;
    public string IpAddress { get; set; } = string.Empty;
    public string UserAgent { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Category { get; set; } = "Operations";
    public string Status { get; set; } = "Success";
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Contractor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string LogisticsType { get; set; } = Constants.LogisticsTypes.Railway;
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ContractorDestination
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ContractorName { get; set; } = string.Empty;
    public string LogisticsType { get; set; } = Constants.LogisticsTypes.Railway;
    public string StationName { get; set; } = string.Empty;
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class SystemSetting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class CatalogProduct
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string LogisticsType { get; set; } = Constants.LogisticsTypes.Railway;
    public string OrderPrefix { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CatalogWagonType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Konteynerlar reestri (fiting platforma konteynerlari).</summary>
public class CatalogContainer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Masalan: UNGU 010006/1</summary>
    public string ContainerNumber { get; set; } = string.Empty;
    /// <summary>Ishlab chiqarilgan sana / yil.</summary>
    public DateTime? BuiltAt { get; set; }
    /// <summary>Keyingi ishlatish / tekshiruv sanasi.</summary>
    public DateTime? NextInspectionAt { get; set; }
    /// <summary>Keyingi tekshiruvgacha qolgan kun (0 = muddati o‘tgan).</summary>
    public int? DaysUntilNextInspection { get; set; }
    /// <summary>Yuborilgan manzil (stansiya).</summary>
    public string? DestinationStation { get; set; }
    /// <summary>Yuborilgan sana.</summary>
    public DateTime? SentAt { get; set; }
    /// <summary>Yo‘lda kunlar soni.</summary>
    public int? DaysInTransit { get; set; }
    public string? Notes { get; set; }
    /// <summary>yaroqli | eslatma | yaroqsiz — majmuada qo‘lda holat.</summary>
    public string? Serviceability { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Majmua / Tashqi vagonlar parki — raqam bo‘yicha tegishlilik.</summary>
public class CatalogFleetWagon
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string WagonNumber { get; set; } = string.Empty;
    /// <summary>majmua | tashqi</summary>
    public string Ownership { get; set; } = Constants.WagonOwnership.Tashqi;
    /// <summary>sisterna | closed | platform (ixtiyoriy)</summary>
    public string? WagonKind { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    /// <summary>yaroqli | eslatma | yaroqsiz — majmuada qo‘lda holat.</summary>
    public string? Serviceability { get; set; }

    /// <summary>Ishlab chiqarilgan sana / yil.</summary>
    public DateTime? BuiltAt { get; set; }
    /// <summary>Oxirgi kapital ta'mir.</summary>
    public DateTime? LastCapitalRepairAt { get; set; }
    /// <summary>Oxirgi depo hajmida ta'mir.</summary>
    public DateTime? LastDepotRepairAt { get; set; }
    /// <summary>Keyingi depo ta'mirigacha qolgan kun (manfiy = muddati o‘tgan).</summary>
    public int? DaysUntilNextDepotRepair { get; set; }
    /// <summary>Yuborilgan manzil (stansiya).</summary>
    public string? DestinationStation { get; set; }
    /// <summary>Yuborilgan sana.</summary>
    public DateTime? SentAt { get; set; }
    /// <summary>Harakatlanish muddati (kun).</summary>
    public int? DaysInTransit { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class CatalogStation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string LogisticsType { get; set; } = Constants.LogisticsTypes.Railway;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class EmptyWagonArrival
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ArrivalNumber { get; set; } = string.Empty;
    public DateTime ArrivalDate { get; set; } = DateTime.UtcNow;
    public int WagonCount { get; set; }
    public string WagonNumbers { get; set; } = string.Empty;
    public string CisternNumbers { get; set; } = string.Empty;
    public string ProductType { get; set; } = string.Empty;
    public string TrackNumber { get; set; } = string.Empty;
    public string NotifiedDepartments { get; set; } = string.Empty;
    public string PreparedDepartments { get; set; } = string.Empty;
    public string Stage { get; set; } = "KengsoyInspection";
    public string TareWeight { get; set; } = string.Empty;
    /// <summary>Yuklangandan keyin brutto (vagon:kg formatida).</summary>
    public string GrossWeight { get; set; } = string.Empty;
    public string VerifiedWagonNumbers { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    /// <summary>TM va XA yuklash izohi.</summary>
    public string LoadingComment { get; set; } = string.Empty;
    public string LoadingCompletedByName { get; set; } = string.Empty;
    public DateTime? LoadingCompletedAt { get; set; }
    public DateTime? EconomistNotifiedAt { get; set; }
    public string EntryPermitNumber { get; set; } = string.Empty;
    public DateTime? EntryPermitShiftApprovedAt { get; set; }
    public string EntryPermitShiftApprovedByName { get; set; } = string.Empty;
    public DateTime? EntryPermitPermitApprovedAt { get; set; }
    public string EntryPermitPermitApprovedByName { get; set; } = string.Empty;
    public DateTime? EntryPermitSecurityApprovedAt { get; set; }
    public string EntryPermitSecurityApprovedByName { get; set; } = string.Empty;
    public string EntryPermitQrGlobalId { get; set; } = string.Empty;
    public string EntryPermitQrVerificationUrl { get; set; } = string.Empty;
    public string EntryPermitQrCodeBase64 { get; set; } = string.Empty;
    public DateTime? EntryPermitQrRegisteredAt { get; set; }
    public string EntryPermitQrFinalFileHash { get; set; } = string.Empty;
    /// <summary>Ixtiyoriy: mahsulot bo‘yicha kunlik reja (faqat soni). TM/XA hududga bog‘lamaydi.</summary>
    public Guid? DailyPlanId { get; set; }
    public DailyPlan? DailyPlan { get; set; }
    /// <summary>Legacy — operatsiyada ishlatilmaydi (Kengsoy keyin ajratadi). Doim null saqlanadi.</summary>
    public Guid? DailyPlanLineId { get; set; }
    public DailyPlanLine? DailyPlanLine { get; set; }
    public Guid CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<EmptyWagonUnit> Units { get; set; } = [];
}

/// <summary>Partiya ichidagi alohida vagon — tara, yuklash, brutto/netto vagon bo‘yicha.</summary>
public static class EmptyWagonUnitStatuses
{
    public const string AwaitingTare = "AwaitingTare";
    public const string Tared = "Tared";
    public const string Estakada = "Estakada";
    public const string Loading = "Loading";
    public const string Loaded = "Loaded";
    // Explicit gross review: retain measured values until the operator advances the wagon.
    public const string ToRailwayScale = "ToRailwayScale";
    public const string GrossWeighed = "GrossWeighed";
    /// <summary>Brutto/netto dan keyin plomba o‘rnatish jarayoni.</summary>
    public const string SealPending = "SealPending";
    /// <summary>Plomba + UNG + uch bo‘lim tasdiqi tugagan.</summary>
    public const string Sealed = "Sealed";
    /// <summary>Yuklash yoki tarada nuqson/kamchilik — vagon qaytarilgan (estakadaga bermay).</summary>
    public const string Returned = "Returned";
}

public class EmptyWagonUnit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EmptyWagonArrivalId { get; set; }
    public EmptyWagonArrival? Arrival { get; set; }
    public int SortOrder { get; set; }
    public string WagonNumber { get; set; } = string.Empty;
    public string CisternNumber { get; set; } = string.Empty;
    /// <summary>sisterna | closed | platform</summary>
    public string WagonType { get; set; } = string.Empty;
    /// <summary>majmua | tashqi</summary>
    public string Ownership { get; set; } = Constants.WagonOwnership.Tashqi;
    /// <summary>Qabul vaqtidagi yuk holati: bosh | yukli | tola</summary>
    public string IntakeLoadState { get; set; } = Constants.WagonIntakeLoadState.Bosh;
    /// <summary>Ushbu vagon qaysi mahsulot uchun tanlangani.</summary>
    public string ProductType { get; set; } = string.Empty;
    public string Status { get; set; } = EmptyWagonUnitStatuses.AwaitingTare;
    public string TareWeight { get; set; } = string.Empty;
    /// <summary>Fitting platformaning konteynerlarsiz o‘z tara og‘irligi.</summary>
    public string PlatformTareWeight { get; set; } = string.Empty;
    /// <summary>Fitting platformadagi konteyner taralari: JSON { containerNumber: weightTn }.</summary>
    public string ContainerTareWeights { get; set; } = string.Empty;
    public string GrossWeight { get; set; } = string.Empty;
    public string LoadingComment { get; set; } = string.Empty;
    /// <summary>Nomuvofiqlik dalolatnomasi rekvizitlari (Temir yo‘l biriktiradi).</summary>
    public string DefectActNumber { get; set; } = string.Empty;
    /// <summary>platform_no_product | platform_repair | sisterna_no_product | sisterna_repair</summary>
    public string DefectActType { get; set; } = string.Empty;
    public string DefectActFileName { get; set; } = string.Empty;
    public string DefectActContentType { get; set; } = string.Empty;
    public long DefectActSizeBytes { get; set; }
    public string DefectActObjectKey { get; set; } = string.Empty;
    public DateTime? DefectActUploadedAt { get; set; }
    public string DefectActUploadedByName { get; set; } = string.Empty;
    /// <summary>Kirish partiyasidan mustaqil TM/XA yuklash guruhi.</summary>
    public string LoadingBatchNumber { get; set; } = string.Empty;
    /// <summary>Vagon estakadaga (yuklash joyiga) qo‘yilgan vaqt.</summary>
    public DateTime? EstakadaPlacedAt { get; set; }
    /// <summary>Vagon estakadadan olingan vaqt — taroziga jo‘natilgan yoki qaytarilgan.</summary>
    public DateTime? EstakadaRemovedAt { get; set; }
    public DateTime? LoadingStartedAt { get; set; }
    public DateTime? LoadingCompletedAt { get; set; }
    /// <summary>Vagon yuklashini yakunlagan TM va XA smena muxandisi.</summary>
    public string LoadingCompletedByName { get; set; } = string.Empty;
    public DateTime? TareWeighedAt { get; set; }
    public DateTime? TareCheckedAt { get; set; }
    public DateTime? GrossWeighedAt { get; set; }
    /// <summary>1C tarozidan chiqish vaqti (datetime_out).</summary>
    public DateTime? ScaleExitedAt { get; set; }

    /// <summary>Plomba (muhr) raqami.</summary>
    public string SealNumber { get; set; } = string.Empty;
    public bool IsManualSeal { get; set; }
    public DateTime? SealedAt { get; set; }
    /// <summary>Ma’lumotlar UNG tarozi tizimiga kiritilgan vaqt.</summary>
    public DateTime? SealEnteredToUngAt { get; set; }
    public DateTime? SealConfirmedByScaleAt { get; set; }
    public string SealConfirmedByScaleName { get; set; } = string.Empty;
    public DateTime? SealConfirmedBySecurityAt { get; set; }
    public string SealConfirmedBySecurityName { get; set; } = string.Empty;
    public DateTime? SealConfirmedByEconomistAt { get; set; }
    public string SealConfirmedByEconomistName { get; set; } = string.Empty;

    // Nomuvofiqlik dalolatnomasi QR Link
    public string DefectActQrGlobalId { get; set; } = string.Empty;
    public string DefectActQrVerificationUrl { get; set; } = string.Empty;
    public string DefectActQrCodeBase64 { get; set; } = string.Empty;
    public DateTime? DefectActQrRegisteredAt { get; set; }
    public string DefectActQrFinalFileHash { get; set; } = string.Empty;
}
