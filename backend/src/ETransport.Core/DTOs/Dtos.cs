namespace ETransport.Core.DTOs;

public record LoginRequest(string Username, string Password);
public record LoginResponse(string Token, string Username, string FullName, string Role, string Department, string Position, string Email, DateTime ExpiresAt, string AvatarUrl = "", bool MustChangePassword = false);
public record UserProfileDto(Guid Id, string Username, string FullName, string Email, string Role, string Department, string Position, string DepartmentShortName, string AvatarUrl = "", bool MustChangePassword = false);
public record UpdateOwnProfileRequest(string FullName);
public record ChangeOwnPasswordRequest(string CurrentPassword, string NewPassword);
/// <summary>Parol almashtirilgach beriladigan yangi token — eski tokenlar bekor qilinadi.</summary>
public record ChangePasswordResultDto(string Token, DateTime ExpiresAt);
public record DashboardStatsDto(
    int TotalOrders, int ActivePlans, int ActiveShipments, int CompletedShipments,
    int PendingApprovals, int WagonsInProcess,
    int RailwayOrders, int RoadOrders, int RailwayShipments, int RoadShipments);

public record MonthlyOrderLineDto(
    Guid Id, int SortOrder, string Contractor, int WagonCount, decimal TonCount, string WagonNumbers,
    string DestinationStation, DateTime? LastLoadingDate, bool AccountantSigned, bool WeigherSigned,
    string QuantityUnit, string AccountingStatus, bool? AccountingReviewChecked,
    int FulfilledWagonCount = 0, decimal FulfilledNetWeight = 0,
    int RemainingWagonCount = 0, decimal RemainingTonCount = 0,
    string ContractNumber = "", string ProductGrade = "");

public record MonthlyOrderDto(
    Guid Id, string OrderNumber, string LogisticsType, string ContractNumber, string ProductType,
    int Year, int Month, DateTime Deadline, string Status, string CreatedBy, DateTime CreatedAt,
    string AccountingApproverName, string MarketingApproverName, string DispatchApproverName,
    List<MonthlyOrderLineDto> Lines, int TotalWagons, decimal TotalTons,
    List<OrderAttachmentDto> Attachments,
    DateTime? SubmittedAt = null,
    DateTime? ApprovedAt = null,
    DateTime? SubmittedToDispatchAt = null,
    DateTime? DispatchApprovedAt = null,
    DateTime? MarketingApprovedAt = null,
    string DeputyApproverName = "",
    DateTime? DeputyApprovedAt = null,
    string QrGlobalId = "",
    string QrVerificationUrl = "",
    string QrCodeBase64 = "",
    DateTime? QrRegisteredAt = null,
    string ProductGrade = "");

public record OrderAttachmentDto(
    Guid Id, string FileName, string ContentType, long SizeBytes, DateTime UploadedAt, string UploadedBy);

public record MonthlyOrderLineInput(
    int SortOrder, string Contractor, int WagonCount, string WagonNumbers,
    string DestinationStation, DateTime? LastLoadingDate, string QuantityUnit = "wagon",
    Guid? Id = null, decimal TonCount = 0, string? ContractNumber = null, string? ProductGrade = null);

public record AccountingReviewSelection(string Contractor, bool Checked);

public record SaveAccountingReviewRequest(List<AccountingReviewSelection> Selections);

public record CreateMonthlyOrderRequest(
    string LogisticsType, string ContractNumber, string ProductType, int Year, int Month,
    DateTime Deadline, List<MonthlyOrderLineInput> Lines, string ProductGrade = "",
    /// <summary>Qo‘lda kiritilgan buyurtma raqami; bo‘sh bo‘lsa tizim o‘zi beradi.</summary>
    string? OrderNumber = null);

public record UpdateMonthlyOrderRequest(
    string ContractNumber, string ProductType, DateTime Deadline, List<MonthlyOrderLineInput> Lines,
    string EditComment, string ProductGrade = "", string? OrderNumber = null);
public record DailyPlanLineDto(
    Guid Id, Guid MonthlyOrderLineId, string Contractor, string DestinationStation, int PlannedWagons);

public record DailyPlanDto(
    Guid Id, string PlanNumber, Guid? MonthlyOrderId, string? OrderNumber, string? ProductType,
    DateTime PlanDate, int PlannedWagons, decimal PlannedAmount, string Notes, string Status,
    string CreatedBy, DateTime CreatedAt, List<DailyPlanLineDto> Lines);

public record CreateDailyPlanLineRequest(Guid MonthlyOrderLineId, int PlannedWagons);

public record CreateDailyPlanRequest(
    Guid? MonthlyOrderId, DateTime PlanDate, int PlannedWagons, decimal PlannedAmount, string Notes,
    List<CreateDailyPlanLineRequest>? Lines = null);

public record OrderLinePlanBalanceDto(
    Guid LineId, string Contractor, string DestinationStation,
    int OrderedWagons, int PlannedWagons, int RemainingWagons);

public record OrderPlanBalanceDto(
    Guid OrderId, string OrderNumber, string ProductType, string LogisticsType,
    int Year, int Month, string Status,
    int TotalOrdered, int TotalPlanned, int TotalRemaining,
    List<OrderLinePlanBalanceDto> Lines);

/// <summary>
/// ICHDX yuklash taqsimoti uchun tara o‘lchangan (va hali yuklashga biriktirilmagan) vagonlar fondi.
/// AvailableToAllocate = estakadagi (TareReadyWagons) − ReservedUnfilled.
/// TareReadyWagons — Stage = EstakadaPlaced bo‘lgan bo‘sh vagonlar.
/// </summary>
public record PlanWagonAvailabilityDto(
    string ProductType,
    int TareReadyWagons,
    int ReservedUnfilled,
    int AvailableToAllocate);

public record ShipmentDto(Guid Id, string ShipmentNumber, string ProductType, string Status, string DestinationStation, int WagonCount, DateTime CreatedAt, DateTime? CompletedAt);
public record ShipmentDetailDto(Guid Id, string ShipmentNumber, string ProductType, string Status, string DestinationStation, DateTime CreatedAt, List<WagonDto> Wagons, List<StatusHistoryDto> StatusHistory);
public record WagonDto(Guid Id, string WagonNumber, string CisternNumber, bool IsInspected, bool IsLoaded, string SealNumber, WeighingRecordDto? Weighing);
public record WeighingRecordDto(decimal TareWeight, decimal GrossWeight, decimal NetWeight, DateTime WeighedAt);
public record StatusHistoryDto(string FromStatus, string ToStatus, string Comment, string ChangedBy, DateTime ChangedAt);
public record CreateWagonRequest(string WagonNumber, string CisternNumber);
public record WeighingRequest(decimal TareWeight, decimal GrossWeight);
public record SealRequest(string SealNumber);
public record StatusUpdateRequest(string Comment);
public record SecurityCheckRequest(bool Approved, string Comment);
public record ApiResponse<T>(bool Success, T? Data, string? Message = null);
public record MenuItemDto(string Key, string Label, string Path, string Icon);
public record DispatchJournalDto(Guid Id, Guid ShipmentId, string Entry, string RecordedBy, DateTime RecordedAt);
public record ShippingRegistryDto(Guid Id, Guid ShipmentId, string RegistryNumber, bool IsApprovedByPermit, bool IsApprovedBySecurity, string SecurityCheckResult, DateTime PreparedAt);

public record LoadingRegistryDto(
    Guid Id,
    Guid EmptyWagonArrivalId,
    string ArrivalNumber,
    string ProductType,
    int WagonCount,
    string RegistryNumber,
    bool IsApprovedByEconomist,
    DateTime? EconomistApprovedAt,
    bool IsEconomistApprovedWithPermit,
    DateTime? EconomistApprovedWithPermitAt,
    bool IsEconomistApprovedWithSecurity,
    DateTime? EconomistApprovedWithSecurityAt,
    bool IsApprovedByPermit,
    bool IsApprovedBySecurity,
    string PermitCheckResult,
    string SecurityCheckResult,
    string LastRevisionComment,
    DateTime? RevisedAt,
    bool IsSentToOneC,
    bool IsSentToENakl,
    DateTime? SentToOneCAt,
    DateTime? SentToENaklAt,
    DateTime? HandoverToMachinistAt,
    DateTime? ExitedToKengsoyAt,
    DateTime PreparedAt,
    string PreparedByName,
    string EconomistApprovedByName,
    string PermitApprovedByName,
    string SecurityApprovedByName,
    DateTime? PermitApprovedAt,
    DateTime? SecurityApprovedAt,
    Guid? MonthlyOrderId,
    Guid? MonthlyOrderLineId,
    string OrderNumber,
    string ContractNumber,
    string ContractorName,
    string DestinationStation,
    bool IsApprovedByShiftSupervisor,
    DateTime? ShiftSupervisorApprovedAt,
    string ShiftSupervisorApprovedByName,
    List<LoadingRegistryWagonRouteDto> WagonRoutes,
    int OrderDeductedWagons,
    decimal OrderDeductedNetWeight,
    string QrGlobalId = "",
    string QrVerificationUrl = "",
    string QrCodeBase64 = "",
    DateTime? QrRegisteredAt = null
);

public record LoadingRegistryWagonRouteDto(
    string WagonNumber,
    Guid MonthlyOrderLineId,
    string ContractorName,
    string DestinationStation,
    bool IsDefective = false,
    string DefectReason = "",
    string DefectActFileName = "",
    Guid? MonthlyOrderId = null,
    string OrderNumber = "",
    string ProductType = "",
    Guid? SourceArrivalId = null,
    string SourceArrivalNumber = "",
    /// <summary>Hujjat tuzilgan paytdagi netto nusxasi — buyurtma hisobini qaytarishda shu qiymat ishlatiladi.</summary>
    decimal NetWeight = 0);
public record CreateLoadingRegistryWagonRouteRequest(
    string WagonNumber,
    Guid? MonthlyOrderLineId = null,
    bool IncludeDefective = false,
    Guid? MonthlyOrderId = null,
    Guid? SourceArrivalId = null,
    bool IsDefective = false,
    /// <summary>Buyurtma qatorida stansiya yo‘q bo‘lsa, yuk xatida tanlangan stansiya.</summary>
    string? DestinationStation = null);
public record CreateLoadingRegistryRequest(
    Guid EmptyWagonArrivalId,
    string RegistryNumber,
    Guid? MonthlyOrderId,
    Guid? MonthlyOrderLineId,
    List<CreateLoadingRegistryWagonRouteRequest>? WagonRoutes = null);
public record ApproveEconomistWithPermitRequest(string? Comment = null);
public record ApproveEconomistWithSecurityRequest(string? Comment = null);
public record ApprovePermitRequest(bool Approved, string? Comment = null);
public record ApproveSecurityRequest(bool Approved, string? Comment = null);
public record SendToExternalSystemsRequest(string? Comment = null);
public record HandoverToMachinistRequest(string? Comment = null);
public record UpdateLoadingRegistryRequest(
    string RegistryNumber,
    string RevisionComment,
    List<CreateLoadingRegistryWagonRouteRequest>? WagonRoutes = null);
public record LoadingCompleteRequest(string? Comment, string? WagonNumbers = null, string? CisternNumbers = null);
/// <summary>TM/XA yuklash — ixtiyoriy izoh (vagon bo‘yicha endpointlar asosiy).</summary>
public record LoadingStartRequest(string? Comment = null);
/// <summary>Yuklashda nuqson/kamchilik — vagonni qaytarish sababi.</summary>
public record LoadingReturnRequest(string Reason);
/// <summary>Yuklashni orqaga qaytarish (rollback) sababi.</summary>
public record LoadingRollbackRequest(string Reason);
public record BulkLoadingRequest(List<Guid> UnitIds, string? Comment = null);
public record LoadingWagonEditRequest(
    string EditComment,
    string? ProductType = null,
    string? LoadingComment = null,
    string? LoadingBatchNumber = null,
    string? TareWeight = null,
    string? GrossWeight = null);
public record AddInternalWagonsRequest(
    string WagonNumbers,
    string ProductType,
    string? WagonType = null,
    string? TareWeight = null,
    string? Comment = null,
    string? IntakeLoadStates = null);
public record EmptyWagonUnitDto(
    Guid Id,
    string WagonNumber,
    string CisternNumber,
    string Status,
    string TareWeight,
    string GrossWeight,
    string? NettoWeight,
    string LoadingComment,
    DateTime? LoadingStartedAt,
    DateTime? LoadingCompletedAt,
    string LoadingCompletedByName,
    DateTime? TareWeighedAt,
    DateTime? GrossWeighedAt,
    int SortOrder,
    string SealNumber = "",
    DateTime? SealedAt = null,
    DateTime? SealEnteredToUngAt = null,
    DateTime? SealConfirmedByScaleAt = null,
    string SealConfirmedByScaleName = "",
    DateTime? SealConfirmedBySecurityAt = null,
    string SealConfirmedBySecurityName = "",
    DateTime? SealConfirmedByEconomistAt = null,
    string SealConfirmedByEconomistName = "",
    DateTime? ScaleExitedAt = null,
    string WagonType = "",
    string Ownership = "tashqi",
    string IntakeLoadState = "bosh",
    string ProductType = "",
    string PlatformTareWeight = "",
    string ContainerTareWeights = "",
    string LoadingBatchNumber = "",
    string DefectActNumber = "",
    string DefectActType = "",
    string DefectActFileName = "",
    DateTime? DefectActUploadedAt = null,
    string DefectActUploadedByName = "",
    string DefectActQrGlobalId = "",
    string DefectActQrVerificationUrl = "",
    string DefectActQrCodeBase64 = "",
    DateTime? DefectActQrRegisteredAt = null,
    DateTime? TareCheckedAt = null
);

public record CatalogContainerDto(
    Guid Id,
    string ContainerNumber,
    DateTime? BuiltAt,
    DateTime? NextInspectionAt,
    int? DaysUntilNextInspection,
    string? DestinationStation,
    DateTime? SentAt,
    int? DaysInTransit,
    string? Notes,
    string? Serviceability,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateCatalogContainerRequest(
    string ContainerNumber,
    DateTime? BuiltAt = null,
    DateTime? NextInspectionAt = null,
    int? DaysUntilNextInspection = null,
    string? DestinationStation = null,
    DateTime? SentAt = null,
    int? DaysInTransit = null,
    string? Notes = null,
    string? Serviceability = null);

public record UpdateCatalogContainerRequest(
    string ContainerNumber,
    DateTime? BuiltAt = null,
    DateTime? NextInspectionAt = null,
    int? DaysUntilNextInspection = null,
    string? DestinationStation = null,
    DateTime? SentAt = null,
    int? DaysInTransit = null,
    string? Notes = null,
    string? Serviceability = null,
    bool IsActive = true);

public record ContainerImportRow(
    string ContainerNumber,
    DateTime? BuiltAt = null,
    DateTime? NextInspectionAt = null,
    int? DaysUntilNextInspection = null,
    string? DestinationStation = null,
    DateTime? SentAt = null,
    int? DaysInTransit = null,
    string? Notes = null);

public record ContainerImportRequest(List<ContainerImportRow> Rows);

public record ContainerImportResultDto(int Created, int Updated, int Skipped, List<string> Errors);

public record CatalogFleetWagonDto(
    Guid Id,
    string WagonNumber,
    string Ownership,
    string? WagonKind,
    bool IsActive,
    string? Notes,
    string? Serviceability,
    DateTime? BuiltAt,
    DateTime? LastCapitalRepairAt,
    DateTime? LastDepotRepairAt,
    int? DaysUntilNextDepotRepair,
    string? DestinationStation,
    DateTime? SentAt,
    int? DaysInTransit,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateCatalogFleetWagonRequest(
    string WagonNumber,
    string Ownership,
    string? WagonKind = null,
    string? Notes = null,
    string? Serviceability = null,
    DateTime? BuiltAt = null,
    DateTime? LastCapitalRepairAt = null,
    DateTime? LastDepotRepairAt = null,
    int? DaysUntilNextDepotRepair = null,
    string? DestinationStation = null,
    DateTime? SentAt = null,
    int? DaysInTransit = null);

public record UpdateCatalogFleetWagonRequest(
    string WagonNumber,
    string Ownership,
    string? WagonKind = null,
    string? Notes = null,
    string? Serviceability = null,
    bool IsActive = true,
    DateTime? BuiltAt = null,
    DateTime? LastCapitalRepairAt = null,
    DateTime? LastDepotRepairAt = null,
    int? DaysUntilNextDepotRepair = null,
    string? DestinationStation = null,
    DateTime? SentAt = null,
    int? DaysInTransit = null);

public record FleetWagonLookupDto(string WagonNumber, string? Ownership, bool Found);

public record FleetWagonImportRow(
    string WagonNumber,
    string? Ownership = null,
    DateTime? BuiltAt = null,
    DateTime? LastCapitalRepairAt = null,
    DateTime? LastDepotRepairAt = null,
    int? DaysUntilNextDepotRepair = null,
    string? DestinationStation = null,
    DateTime? SentAt = null,
    int? DaysInTransit = null,
    string? Notes = null);

public record FleetWagonImportRequest(List<FleetWagonImportRow> Rows, string DefaultOwnership = "majmua");

public record FleetWagonImportResultDto(int Created, int Updated, int Skipped, List<string> Errors);
public record LoadingTaskDto(
    Guid Id,
    string ArrivalNumber,
    DateTime ArrivalDate,
    int WagonCount,
    string WagonNumbers,
    string CisternNumbers,
    string ProductType,
    string TrackNumber,
    string Stage,
    string TareWeight,
    string LoadingComment,
    string LoadingCompletedByName,
    DateTime? LoadingCompletedAt,
    DateTime? EconomistNotifiedAt,
    string CreatedByName,
    DateTime CreatedAt,
    string GrossWeight = "",
    Guid? DailyPlanId = null,
    string PlanNumber = "",
    List<EmptyWagonUnitDto>? Wagons = null
);
public record InvoiceDto(Guid Id, string InvoiceNumber, string ShipmentNumber, decimal Amount, string Status, DateTime CreatedAt);
public record ContractorDto(Guid Id, string Name, string LogisticsType, bool IsSystem, DateTime CreatedAt);
public record CreateContractorRequest(string Name, string LogisticsType);
public record UpdateContractorRequest(string Name, string? LogisticsType = null);
public record ContractorDestinationDto(
    Guid Id, string ContractorName, string LogisticsType, string StationName, bool IsSystem, DateTime CreatedAt);
public record CreateContractorDestinationRequest(string ContractorName, string LogisticsType, string StationName);
public record CatalogProductDto(
    Guid Id, string Name, string LogisticsType, string OrderPrefix, int SortOrder, bool IsActive, bool IsSystem, DateTime CreatedAt);
public record CreateCatalogProductRequest(string Name, string LogisticsType, string OrderPrefix, int? SortOrder = null);
public record UpdateCatalogProductRequest(string Name, string OrderPrefix, int? SortOrder = null, bool? IsActive = null);

public record CatalogWagonTypeDto(
    Guid Id, string Name, string? Code, string? Description, int SortOrder, bool IsActive, bool IsSystem, DateTime CreatedAt);
public record CreateCatalogWagonTypeRequest(string Name, string? Code = null, string? Description = null, int? SortOrder = null);
public record UpdateCatalogWagonTypeRequest(string Name, string? Code = null, string? Description = null, int? SortOrder = null, bool? IsActive = null);

public record CatalogStationDto(
    Guid Id, string Name, string? Code, string LogisticsType, int SortOrder, bool IsActive, bool IsSystem, DateTime CreatedAt);
public record CreateCatalogStationRequest(string Name, string? Code = null, string? LogisticsType = null, int? SortOrder = null);
public record UpdateCatalogStationRequest(string Name, string? Code = null, string? LogisticsType = null, int? SortOrder = null, bool? IsActive = null);

public record ServiceDetailItemDto(string Key, string Value);

public record ServerSystemInfoDto(
    string Hostname,
    string OsDescription,
    string Architecture,
    int CpuCores,
    string SystemUptime,
    string ApiUptime,
    string ShortUptime,
    string SslCertExpire,
    string Domain,
    string DotnetVersion,
    DateTime ServerTime);

public record ServerMetricsDto(
    double CpuPercent,
    int CpuCores,
    double CpuAvgLoad,
    double RamPercent,
    double RamTotalGb,
    double RamUsedGb,
    double RamFreeGb,
    double DiskPercent,
    double DiskFreeGb,
    double DiskUsedGb,
    double DiskTotalGb,
    double TrafficPercent,
    double TrafficIncomingMb,
    double TrafficOutgoingMb);

public record ServerServiceStatusDto(
    string Key,
    string Label,
    bool IsHealthy,
    string? Message,
    long LatencyMs = 0,
    string? Port = null,
    string? Type = null,
    string? Version = null,
    List<ServiceDetailItemDto>? Details = null);

public record ServerStatusDto(
    DateTime Timestamp,
    ServerSystemInfoDto SystemInfo,
    ServerMetricsDto Metrics,
    List<ServerServiceStatusDto> Services);
