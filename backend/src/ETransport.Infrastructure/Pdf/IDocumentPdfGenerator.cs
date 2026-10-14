namespace ETransport.Infrastructure.Pdf;

public record DefectActPdfModel(
    string ActNumber,
    string? ActType,
    string WagonNumber,
    string? CisternNumber,
    string? WagonType,
    string? ProductType,
    string? ArrivalNumber,
    string? Comment,
    DateTime CreatedAt,
    string? CreatedByName,
    string? QrVerificationUrl,
    string? QrGlobalId,
    string? DispatcherName = null,
    DateTime? DispatcherAt = null,
    string? HandoverName = null,
    DateTime? HandoverAt = null,
    string? ScaleName = null,
    DateTime? ScaleAt = null,
    DateTime? ApprovedAt = null
);

public record YukXatiPdfWagonRow(
    int Index,
    string WagonNumber,
    string? CisternNumber,
    string? WagonType,
    string? ProductType,
    decimal TareWeight,
    decimal BruttoWeight,
    decimal NettoWeight,
    string? SealNumbers,
    string? Status,
    string? ReceiverAndStation = null,
    bool IsDefective = false,
    string? DefectActFileName = null
);

public record YukXatiPdfSigner(
    string Key,
    string Department,
    string Status,
    string? Name,
    DateTime? At
);

public record YukXatiPdfModel(
    string RegistryNumber,
    string? OrderNumber,
    string? CustomerName,
    string? DestinationStation,
    string? ProductType,
    int WagonCount,
    decimal TotalNetto,
    DateTime PreparedAt,
    string PreparedByName,
    string? InspectorName,
    string? SecurityOfficerName,
    string? QrVerificationUrl,
    string? QrGlobalId,
    List<YukXatiPdfWagonRow> Wagons,
    decimal TotalTare = 0,
    decimal TotalBrutto = 0,
    string? LoadingTaskNo = null,
    DateTime? ExitDate = null,
    string? ContractNo = null,
    string? ConsignorName = "\"SHURTAN GAZ KIMYO MAJMUASI\" MCHJ",
    string? ConsignorStation = "732602 - KENGSOY",
    string? ConsignorAddress = "Qashqadaryo viloyati, G'uzor tumani, Shurtan qo'rg'oni",
    bool PermitOk = true,
    bool PermitDenied = false,
    string? ShiftLeaderName = null,
    DateTime? ShiftLeaderAt = null,
    List<YukXatiPdfSigner>? Signers = null
);

public record EntryPermitPdfWagonRow(
    int Index,
    string WagonNumber,
    string? CisternNumber,
    string? WagonType,
    string? ProductType,
    string? Status
);

public record EntryPermitPdfSigner(
    string Key,
    string Department,
    string Status,
    string? Name,
    DateTime? At
);

public record EntryPermitPdfModel(
    string PermitNumber,
    string? ArrivalNumber,
    string? ProductType,
    int WagonCount,
    DateTime CreatedAt,
    string CreatedByName,
    string? QrVerificationUrl,
    string? QrGlobalId,
    List<EntryPermitPdfWagonRow> Wagons,
    string? ShiftLeaderName = null,
    DateTime? ShiftLeaderAt = null,
    bool ShiftLeaderApproved = false,
    string? PermitOfficerName = null,
    DateTime? PermitOfficerAt = null,
    string? SecurityOfficerName = null,
    DateTime? SecurityOfficerAt = null,
    DateTime? ApprovedAt = null,
    bool IsDone = false,
    List<EntryPermitPdfSigner>? Signers = null
);

public record MonthlyOrderPdfLineRow(
    int Index,
    string Contractor,
    int WagonCount,
    decimal TonCount,
    string? ContractNumber,
    string DestinationStation,
    bool IsFirstInGroup = true,
    int GroupRowSpan = 1,
    bool IsFirstInTable = true,
    int TotalTableRows = 1,
    string ProductGrade = "",
    string CustomerOrderNumber = ""
);

public record MonthlyOrderPdfModel(
    string OrderNumber,
    string ProductType,
    string Status,
    DateTime? ApprovedAt,
    string? DeputyApproverName,
    DateTime? DeputyApprovedAt,
    string? MarketingApproverName,
    DateTime? MarketingApprovedAt,
    string? AccountingApproverName,
    DateTime? AccountingApprovedAt,
    string? QrVerificationUrl,
    string? QrGlobalId,
    string? ContractNumber,
    List<MonthlyOrderPdfLineRow> Lines,
    int TotalWagons,
    decimal TotalTons
);

public interface IDocumentPdfGenerator
{
    byte[] GenerateDefectActPdf(DefectActPdfModel model);
    byte[] GenerateYukXatiPdf(YukXatiPdfModel model);
    byte[] GenerateEntryPermitPdf(EntryPermitPdfModel model);
    byte[] GenerateMonthlyOrderPdf(MonthlyOrderPdfModel model);
}
