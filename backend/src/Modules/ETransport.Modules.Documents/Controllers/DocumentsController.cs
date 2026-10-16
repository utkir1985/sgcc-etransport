using ETransport.Infrastructure.Identity;
using ETransport.Infrastructure.Notifications;
using System.Data;
using System.Security.Claims;
using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Core.Interfaces;
using ETransport.Infrastructure.Audit;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Pdf;
using ETransport.Infrastructure.Storage;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Documents.Controllers;

public record IssueDefectActRequest(string ActType, string? ScaleOperatorName = null);

[ApiController]
[Route("api/documents")]
[Authorize]
public class DocumentsController(
    AppDbContext db,
    IFileStorageService fileStorage,
    IQrLinkService qrLinkService,
    IDocumentPdfGenerator pdfGenerator,
    IHttpClientFactory httpClientFactory,
    IDocumentNumberingService numberingService,
    IAuditService auditService,
    ITelegramNotificationService? telegramService = null) : ControllerBase
{
    private void TryNotifyTelegram(TelegramStageEvent stageEvent)
    {
        if (telegramService == null) return;
        _ = Task.Run(async () =>
        {
            try { await telegramService.NotifyStageChangeAsync(stageEvent); }
            catch { /* ignored */ }
        });
    }
    // Existing documents retain their workflow. Only documents prepared after rollout join the serial queue.
    private static readonly DateTime SequentialWorkflowStartsAt = new(2026, 9, 29, 8, 51, 5, DateTimeKind.Utc);

    private static bool IsWorkflowLocked(LoadingRegistry registry) =>
        registry.PreparedAt >= SequentialWorkflowStartsAt
        && (registry.ExitedToKengsoyAt.HasValue || registry.IsSentToOneC || registry.IsSentToENakl);

    private const long MaxDefectActBytes = 20 * 1024 * 1024;
    private static readonly HashSet<string> AllowedDefectActExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp",
    };
    private static readonly HashSet<string> AllowedDefectActTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "platform_no_product", "platform_repair", "sisterna_no_product", "sisterna_repair",
    };

    private static bool HasDefectAct(EmptyWagonUnit unit) =>
        !string.IsNullOrWhiteSpace(unit.DefectActNumber) || !string.IsNullOrWhiteSpace(unit.DefectActObjectKey);

    private static string WagonSourceKey(Guid? arrivalId, string wagonNumber) =>
        $"{arrivalId}:{wagonNumber.Trim()}".ToLowerInvariant();

    /// <summary>Vagonning shu tashrifdagi netto og‘irligi (tonna).</summary>
    private static decimal UnitNetWeight(EmptyWagonUnit unit) =>
        EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var net)
            ? Math.Max(0, net)
            : 0;

    /// <summary>
    /// Yuk xatidagi vagon aynan qaysi tashrifga tegishli ekanini aniqlaydi.
    /// Vagon qayta kelgan bo‘lsa, boshqa tashrif yozuvi qaytarilmasligi uchun kalit
    /// har doim (tashrif + vagon raqami) juftligi bo‘yicha tuziladi.
    /// </summary>
    private static string RouteVisitKey(LoadingRegistryWagonRouteDto route, Guid registryArrivalId) =>
        WagonSourceKey(route.SourceArrivalId ?? registryArrivalId, route.WagonNumber ?? string.Empty);

    /// <summary>
    /// Buyurtmadan qaytariladigan netto. Hujjatda saqlangan nusxa bo‘lsa — o‘sha,
    /// aks holda (eski hujjatlar) aynan shu tashrifdagi vagon o‘lchovi olinadi.
    /// </summary>
    private static decimal RevertNetWeight(
        LoadingRegistryWagonRouteDto route,
        Guid registryArrivalId,
        IReadOnlyDictionary<string, EmptyWagonUnit> unitsByVisit)
    {
        if (route.NetWeight > 0) return route.NetWeight;
        return unitsByVisit.TryGetValue(RouteVisitKey(route, registryArrivalId), out var unit)
            ? UnitNetWeight(unit)
            : 0;
    }

    /// <summary>Yuk xatidagi yo‘nalishlar uchun aynan o‘sha tashrifdagi vagon yozuvlarini yuklaydi.</summary>
    private async Task<Dictionary<string, EmptyWagonUnit>> LoadUnitsByVisitAsync(
        IEnumerable<LoadingRegistryWagonRouteDto> routes,
        Guid registryArrivalId)
    {
        var routeList = routes.ToList();
        if (routeList.Count == 0) return new Dictionary<string, EmptyWagonUnit>(StringComparer.OrdinalIgnoreCase);

        var arrivalIds = routeList
            .Select(r => r.SourceArrivalId ?? registryArrivalId)
            .Distinct()
            .ToList();
        var numbers = routeList
            .Select(r => (r.WagonNumber ?? string.Empty).Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var units = await db.EmptyWagonUnits
            .Where(u => arrivalIds.Contains(u.EmptyWagonArrivalId) && numbers.Contains(u.WagonNumber))
            .ToListAsync();

        var map = new Dictionary<string, EmptyWagonUnit>(StringComparer.OrdinalIgnoreCase);
        foreach (var unit in units)
            map[WagonSourceKey(unit.EmptyWagonArrivalId, unit.WagonNumber)] = unit;
        return map;
    }

    private async Task<string> NextDefectActNumberAsync()
    {
        return await numberingService.GenerateDefectActNumberAsync();
    }

    private string CurrentUserName() =>
        User.FindFirstValue("fullName")
        ?? User.FindFirstValue(ClaimTypes.Name)
        ?? User.Identity?.Name
        ?? "Foydalanuvchi";

    [HttpGet("registry")]
    [RequirePermission("documents.registry.read")]
    public async Task<ActionResult<ApiResponse<List<ShippingRegistryDto>>>> GetRegistries()
    {
        var list = await db.ShippingRegistries.OrderByDescending(r => r.PreparedAt)
            .Select(r => new ShippingRegistryDto(r.Id, r.ShipmentId, r.RegistryNumber,
                r.IsApprovedByPermit, r.IsApprovedBySecurity, r.SecurityCheckResult, r.PreparedAt))
            .ToListAsync();
        return Ok(new ApiResponse<List<ShippingRegistryDto>>(true, list));
    }

    [HttpPost("registry")]
    [RequirePermission("documents.registry.create")]
    public ActionResult<ApiResponse<object>> CreateRegistry([FromBody] object request) =>
        Ok(new ApiResponse<object>(true, new { message = "Yuk xati yaratish — e-nakl integratsiyasi keyingi bosqichda" }));

    // =========================
    // TM/XA yuklash tugagandan keyin “Yuk xati” (reyestr) MVP
    // EmptyWagonArrival bilan bog'langan
    // =========================

    [HttpGet("loading-registry")]
    [RequirePermission("documents.registry.read")]
    public async Task<ActionResult<ApiResponse<List<LoadingRegistryDto>>>> GetLoadingRegistries()
    {
        var entities = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .OrderByDescending(r => r.PreparedAt)
            .ToListAsync();

        bool hasChanges = false;
        foreach (var r in entities)
        {
            if (r.ExitedToKengsoyAt is null && r.EmptyWagonArrival is not null && r.EmptyWagonArrival.Stage == "Exited")
            {
                var exitedDates = r.EmptyWagonArrival.Units
                    .Where(u => u.ScaleExitedAt.HasValue)
                    .Select(u => u.ScaleExitedAt!.Value)
                    .ToList();
                r.ExitedToKengsoyAt = exitedDates.Count > 0 ? exitedDates.Max() : r.EmptyWagonArrival.CreatedAt;
                hasChanges = true;
            }
        }
        if (hasChanges)
        {
            await db.SaveChangesAsync();
        }

        var list = entities.Select(existingToDto).ToList();
        return Ok(new ApiResponse<List<LoadingRegistryDto>>(true, list));
    }

    [HttpPost("defect-act/{unitId:guid}")]
    [RequirePermission("empty-wagons.defect-act", "flow.seal-edit")]
    [RequestSizeLimit(MaxDefectActBytes + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDefectActBytes + 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<object>>> UploadDefectAct(Guid unitId, IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new ApiResponse<object>(false, null, "Dalolatnoma faylini tanlang"));
        if (file.Length > MaxDefectActBytes)
            return BadRequest(new ApiResponse<object>(false, null, "Dalolatnoma 20 MB dan oshmasligi kerak"));
        var ext = Path.GetExtension(file.FileName ?? "");
        if (string.IsNullOrWhiteSpace(ext) || !AllowedDefectActExtensions.Contains(ext))
            return BadRequest(new ApiResponse<object>(false, null, "PDF, Word yoki rasm faylini yuklang"));

        var unit = await db.EmptyWagonUnits.FirstOrDefaultAsync(u => u.Id == unitId);
        if (unit is null) return NotFound(new ApiResponse<object>(false, null, "Vagon topilmadi"));
        if (unit.Status != EmptyWagonUnitStatuses.Returned)
            return BadRequest(new ApiResponse<object>(false, null, "Dalolatnoma faqat nomuvofiqlik aniqlangan vagonga biriktiriladi"));

        if (!string.IsNullOrWhiteSpace(unit.DefectActObjectKey))
            await fileStorage.DeleteAsync(unit.DefectActObjectKey);
        await using var stream = file.OpenReadStream();
        unit.DefectActObjectKey = await fileStorage.UploadAsync(stream, file.FileName, file.ContentType ?? "application/octet-stream");
        unit.DefectActFileName = Path.GetFileName(file.FileName);
        unit.DefectActContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
        unit.DefectActSizeBytes = file.Length;
        unit.DefectActUploadedAt = DateTime.UtcNow;
        unit.DefectActUploadedByName = CurrentUserName();
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "DefectActCreated",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                fileName = unit.DefectActFileName,
                uploadedByName = unit.DefectActUploadedByName,
                isUploaded = true
            }),
            category: "Operations",
            status: "Warning"
        );

        return Ok(new ApiResponse<object>(true, new
        {
            unit.Id,
            unit.DefectActFileName,
            unit.DefectActUploadedAt,
            unit.DefectActUploadedByName,
        }, "Dalolatnoma biriktirildi"));
    }

        [HttpGet("defect-act/scale-operators")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<List<string>>>> GetScaleOperators()
    {
        var scaleUsers = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRoles.Scale || u.Department == "Tarozi" || u.Department == "TYTT" || u.Role == UserRoles.Railway)
            .Select(u => u.FullName)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToListAsync();

        var recentScaleNames = await db.EmptyWagonUnits.AsNoTracking()
            .Where(u => !string.IsNullOrWhiteSpace(u.SealConfirmedByScaleName))
            .Select(u => u.SealConfirmedByScaleName!)
            .Distinct()
            .Take(30)
            .ToListAsync();

        var allUsers = (await db.Users.AsNoTracking()
            .Where(u => !string.IsNullOrWhiteSpace(u.FullName))
            .Select(u => u.FullName)
            .Distinct()
            .ToListAsync())
            .Where(n => !n.Contains("admin", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var combined = scaleUsers
            .Concat(recentScaleNames)
            .Concat(allUsers)
            .Where(n => !string.IsNullOrWhiteSpace(n) && n != "Tarozi operatori")
            .Distinct()
            .OrderBy(n => n)
            .ToList();

        return Ok(new ApiResponse<List<string>>(true, combined));
    }

    [HttpPost("defect-act/{unitId:guid}/issue")]
    [RequirePermission("empty-wagons.defect-act", "flow.seal-edit")]
    public async Task<ActionResult<ApiResponse<object>>> IssueDefectAct(Guid unitId, [FromBody] IssueDefectActRequest request)
    {
        var actType = request.ActType?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(actType) || !AllowedDefectActTypes.Contains(actType))
            return BadRequest(new ApiResponse<object>(false, null, "Dalolatnoma turini tanlang"));

        var unit = await db.EmptyWagonUnits.FirstOrDefaultAsync(u => u.Id == unitId);
        if (unit is null) return NotFound(new ApiResponse<object>(false, null, "Vagon topilmadi"));

        if (!string.Equals(unit.Status, EmptyWagonUnitStatuses.Returned, StringComparison.OrdinalIgnoreCase))
        {
            unit.Status = EmptyWagonUnitStatuses.Returned;
            EmptyWagonUnitSync.MarkEstakadaRemoved(unit);
        }

        if (string.IsNullOrWhiteSpace(unit.DefectActNumber))
        {
            unit.DefectActNumber = await NextDefectActNumberAsync();
        }
        unit.DefectActType = actType;
        unit.DefectActUploadedAt = DateTime.UtcNow;
        unit.DefectActUploadedByName = CurrentUserName();

        if (!string.IsNullOrWhiteSpace(request.ScaleOperatorName))
        {
            unit.SealConfirmedByScaleName = request.ScaleOperatorName.Trim();
        }
        else if (string.IsNullOrWhiteSpace(unit.SealConfirmedByScaleName))
        {
            var defaultScale = await db.Users.AsNoTracking()
                .Where(u => u.Role == UserRoles.Scale && !string.IsNullOrWhiteSpace(u.FullName))
                .Select(u => u.FullName)
                .FirstOrDefaultAsync();
            if (!string.IsNullOrWhiteSpace(defaultScale))
            {
                unit.SealConfirmedByScaleName = defaultScale;
            }
        }

        var arrival = await db.EmptyWagonArrivals.AsNoTracking().Include(a => a.CreatedBy).FirstOrDefaultAsync(a => a.Id == unit.EmptyWagonArrivalId);
        string fileName = $"Dalolatnoma_{unit.DefectActNumber}_{unit.WagonNumber}.pdf";

        var dispName = !string.IsNullOrWhiteSpace(unit.DefectActUploadedByName) ? unit.DefectActUploadedByName : CurrentUserName();
        var handoverName = !string.IsNullOrWhiteSpace(arrival?.CreatedBy?.FullName) ? arrival.CreatedBy.FullName : dispName;
        var scaleName = !string.IsNullOrWhiteSpace(request.ScaleOperatorName)
            ? request.ScaleOperatorName.Trim()
            : (!string.IsNullOrWhiteSpace(unit.SealConfirmedByScaleName)
                ? unit.SealConfirmedByScaleName
                : (unit.WagonType == "platform" ? dispName : handoverName));

        var initialPdf = pdfGenerator.GenerateDefectActPdf(new DefectActPdfModel(
            ActNumber: unit.DefectActNumber,
            ActType: unit.DefectActType,
            WagonNumber: unit.WagonNumber,
            CisternNumber: unit.CisternNumber,
            WagonType: unit.WagonType,
            ProductType: unit.ProductType ?? arrival?.ProductType,
            ArrivalNumber: arrival?.ArrivalNumber,
            Comment: unit.LoadingComment,
            CreatedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
            CreatedByName: dispName,
            QrVerificationUrl: null,
            QrGlobalId: null,
            DispatcherName: dispName,
            DispatcherAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
            HandoverName: handoverName,
            HandoverAt: arrival?.CreatedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
            ScaleName: scaleName,
            ScaleAt: unit.TareWeighedAt ?? unit.GrossWeighedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
            ApprovedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow
        ));

        var defectQr = await qrLinkService.RegisterDocumentAsync(new QrLinkRegisterRequest(
            SourceDocumentId: unit.DefectActNumber,
            DocumentType: "Dalolatnoma",
            Title: $"Nomuvofiqlik dalolatnomasi № {unit.DefectActNumber} ({unit.WagonNumber})",
            Status: "Approved",
            OwnerName: CurrentUserName(),
            MetadataJson: JsonSerializer.Serialize(new
            {
                documentNumber = unit.DefectActNumber,
                wagonNumber = unit.WagonNumber,
                cisternNumber = unit.CisternNumber,
                actType = unit.DefectActType,
                arrivalNumber = arrival?.ArrivalNumber,
                comment = unit.LoadingComment
            })
        ));

        unit.DefectActQrGlobalId = defectQr.GlobalId;
        unit.DefectActQrVerificationUrl = defectQr.VerificationUrl;
        unit.DefectActQrCodeBase64 = defectQr.QrCodeBase64;
        unit.DefectActQrRegisteredAt = defectQr.RegisteredAt;

        var fileBytes = !string.IsNullOrWhiteSpace(defectQr.GlobalId)
            ? pdfGenerator.GenerateDefectActPdf(new DefectActPdfModel(
                ActNumber: unit.DefectActNumber,
                ActType: unit.DefectActType,
                WagonNumber: unit.WagonNumber,
                CisternNumber: unit.CisternNumber,
                WagonType: unit.WagonType,
                ProductType: unit.ProductType ?? arrival?.ProductType,
                ArrivalNumber: arrival?.ArrivalNumber,
                Comment: unit.LoadingComment,
                CreatedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
                CreatedByName: dispName,
                QrVerificationUrl: unit.DefectActQrVerificationUrl,
                QrGlobalId: unit.DefectActQrGlobalId,
                DispatcherName: dispName,
                DispatcherAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
                HandoverName: handoverName,
                HandoverAt: arrival?.CreatedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
                ScaleName: scaleName,
                ScaleAt: unit.TareWeighedAt ?? unit.GrossWeighedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
                ApprovedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow
            ))
            : initialPdf;

        using var pdfStream = new MemoryStream(fileBytes);
        var objectKey = await fileStorage.UploadAsync(pdfStream, fileName, "application/pdf");
        unit.DefectActObjectKey = objectKey;
        unit.DefectActFileName = fileName;
        unit.DefectActContentType = "application/pdf";
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "DefectActCreated",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                defectActNumber = unit.DefectActNumber,
                defectActType = unit.DefectActType,
                comment = unit.LoadingComment,
                issuedByName = unit.DefectActUploadedByName
            }),
            category: "Operations",
            status: "Warning"
        );

        return Ok(new ApiResponse<object>(true, new
        {
            unit.Id,
            unit.DefectActNumber,
            unit.DefectActType,
            unit.DefectActUploadedAt,
            unit.DefectActUploadedByName,
            DefectActQrGlobalId = unit.DefectActQrGlobalId,
            DefectActQrVerificationUrl = unit.DefectActQrVerificationUrl,
            DefectActQrCodeBase64 = unit.DefectActQrCodeBase64,
            DefectActQrRegisteredAt = unit.DefectActQrRegisteredAt,
        }, "Dalolatnoma tasdiqlandi"));
    }

    [HttpGet("defect-act/{unitId:guid}")]
    public async Task<IActionResult> DownloadDefectAct(Guid unitId)
    {
        var unit = await db.EmptyWagonUnits.AsNoTracking().FirstOrDefaultAsync(u => u.Id == unitId);
        if (unit is null || string.IsNullOrWhiteSpace(unit.DefectActObjectKey)) return NotFound();
        var stream = await fileStorage.DownloadAsync(unit.DefectActObjectKey);
        return stream is null ? NotFound() : File(stream, unit.DefectActContentType, unit.DefectActFileName);
    }

    [HttpPost("loading-registry")]
    [RequirePermission("documents.registry.create")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> CreateLoadingRegistry([FromBody] CreateLoadingRegistryRequest request)
    {
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            // Serializable transaction also prevents two concurrent creates from both passing this check.
            var unfinished = await db.LoadingRegistries.AsNoTracking()
                .Where(r => r.PreparedAt >= SequentialWorkflowStartsAt
                    && (!r.ExitedToKengsoyAt.HasValue || !r.IsSentToOneC || !r.IsSentToENakl))
                .OrderBy(r => r.PreparedAt)
                .FirstOrDefaultAsync();
            if (unfinished is not null)
                return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                    $"Avval {unfinished.RegistryNumber} yuk xati siklini yakunlang: {DescribeUnfinishedPendingAction(unfinished)}."));

            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userId = userIdStr is null ? Guid.Empty : Guid.Parse(userIdStr);

            var arrival = await db.EmptyWagonArrivals.Include(a => a.Units).FirstOrDefaultAsync(a => a.Id == request.EmptyWagonArrivalId);
            if (arrival is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Keltirilgan partiya topilmadi"));

            var requestedRoutes = request.WagonRoutes ?? [];
            if (requestedRoutes.Count == 0 && request.MonthlyOrderLineId is Guid legacyLineId)
            {
                var wagonNumbers = arrival.Units.OrderBy(u => u.SortOrder).Select(u => u.WagonNumber).ToList();
                requestedRoutes = wagonNumbers.Select(n => new CreateLoadingRegistryWagonRouteRequest(n, legacyLineId)).ToList();
            }
            if (requestedRoutes.Count == 0
                || requestedRoutes.Select(x => x.WagonNumber).Distinct(StringComparer.OrdinalIgnoreCase).Count() != requestedRoutes.Count)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Yuk xatiga kiritiladigan vagonlarni va ularning stansiyasini tanlang"));

            var requestedNumbers = requestedRoutes.Select(x => x.WagonNumber.Trim()).Where(x => x.Length > 0).ToList();
            var candidateUnits = await db.EmptyWagonUnits
                .Include(u => u.Arrival)
                .Where(u => requestedNumbers.Contains(u.WagonNumber))
                .ToListAsync();

            var previousRegistries = await db.LoadingRegistries.AsNoTracking()
                .Select(r => new { r.EmptyWagonArrivalId, r.WagonRoutesJson })
                .ToListAsync();

            var alreadyRegistered = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var legacyRegisteredArrivals = new HashSet<Guid>();
            foreach (var previous in previousRegistries)
            {
                var previousRoutes = ParseWagonRoutes(previous.WagonRoutesJson);
                if (previousRoutes.Count > 0)
                {
                    alreadyRegistered.UnionWith(previousRoutes.Select(x => WagonSourceKey(
                        x.SourceArrivalId ?? previous.EmptyWagonArrivalId,
                        x.WagonNumber)));
                }
                else
                {
                    legacyRegisteredArrivals.Add(previous.EmptyWagonArrivalId);
                }
            }

            var unitsByNumber = new Dictionary<string, EmptyWagonUnit>(StringComparer.OrdinalIgnoreCase);
            foreach (var requested in requestedRoutes)
            {
                var matches = candidateUnits
                    .Where(u => string.Equals(u.WagonNumber, requested.WagonNumber, StringComparison.OrdinalIgnoreCase))
                    .Where(u => requested.SourceArrivalId is not Guid sourceArrivalId
                        || u.EmptyWagonArrivalId == sourceArrivalId)
                    .ToList();
                if (matches.Count == 0)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{requested.WagonNumber}: vagon topilmadi"));
                var unused = matches.Where(u =>
                    !alreadyRegistered.Contains(WagonSourceKey(u.EmptyWagonArrivalId, u.WagonNumber))
                    && !legacyRegisteredArrivals.Contains(u.EmptyWagonArrivalId)).ToList();
                var pool = unused.Count > 0 ? unused : matches;
                var unit = pool
                    .OrderByDescending(u => u.EmptyWagonArrivalId == request.EmptyWagonArrivalId)
                    .ThenByDescending(u => u.Status is EmptyWagonUnitStatuses.Sealed or EmptyWagonUnitStatuses.Returned)
                    .ThenByDescending(u => u.GrossWeighedAt)
                    .First();
                unitsByNumber[requested.WagonNumber] = unit;
            }

            foreach (var requested in requestedRoutes)
            {
                var unit = unitsByNumber[requested.WagonNumber];
                if (unit.Status == EmptyWagonUnitStatuses.ToRailwayScale)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: avval brutto/netto qayta tekshiruvini yakunlang"));
                if (unit.Status == EmptyWagonUnitStatuses.Returned)
                {
                    if (!requested.IncludeDefective && !requested.IsDefective)
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{unit.WagonNumber}: nomuvofiq vagon alohida belgilanishi kerak"));
                    if (!HasDefectAct(unit))
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{unit.WagonNumber}: Temir yo‘l dalolatnomasini tuzing"));
                    var defectiveOrderId = requested.MonthlyOrderId ?? request.MonthlyOrderId;
                    if (defectiveOrderId.HasValue != requested.MonthlyOrderLineId.HasValue)
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                            $"{unit.WagonNumber}: nomuvofiq vagon uchun buyurtma va jo‘natish stansiyasini birga tanlang yoki ikkalasini ham bo‘sh qoldiring"));
                }
                else if (!EmptyWagonUnitSync.IsPlombaInstalled(unit))
                {
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: faqat plombalangan yoki dalolatnomali nomuvofiq vagon yuk xatiga kiritiladi"));
                }
                else if (!EmptyWagonUnitSync.HasMeasuredNet(unit))
                {
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: faqat netto tortilgan vagon yuk xatiga kiritiladi"));
                }
            }
            var healthyRequests = requestedRoutes
                .Where(x => unitsByNumber[x.WagonNumber].Status != EmptyWagonUnitStatuses.Returned)
                .ToList();
            var requestedOrderIds = requestedRoutes
                .Select(x => x.MonthlyOrderId ?? request.MonthlyOrderId)
                .Where(x => x.HasValue)
                .Select(x => x!.Value)
                .Distinct()
                .ToList();
            if (requestedOrderIds.Count == 0 && healthyRequests.Count > 0)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Har bir sog‘lom vagon uchun buyurtmani tanlang"));

            var selectedOrders = await db.MonthlyOrders.Include(o => o.Lines)
                .Where(o => requestedOrderIds.Contains(o.Id))
                .ToListAsync();
            var ordersById = selectedOrders.ToDictionary(x => x.Id);
            if (selectedOrders.Count != requestedOrderIds.Count)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Tanlangan buyurtmalardan biri topilmadi"));
            if (selectedOrders.Any(x => x.Status != OrderStatus.Active))
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Faqat tasdiqlangan buyurtmaga biriktirish mumkin"));

            var assignments = new Dictionary<string, (MonthlyOrder Order, MonthlyOrderLine Line, string Station)>(StringComparer.OrdinalIgnoreCase);
            foreach (var requested in requestedRoutes)
            {
                var unit = unitsByNumber[requested.WagonNumber];
                var orderId = requested.MonthlyOrderId ?? request.MonthlyOrderId;
                if (unit.Status == EmptyWagonUnitStatuses.Returned
                    && orderId is null
                    && requested.MonthlyOrderLineId is null)
                    continue;
                if (orderId is not Guid effectiveOrderId || !ordersById.TryGetValue(effectiveOrderId, out var selectedOrder))
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{requested.WagonNumber}: buyurtmani tanlang"));
                if (requested.MonthlyOrderLineId is not Guid lineId
                    || selectedOrder.Lines.FirstOrDefault(x => x.Id == lineId) is not { } selectedLine)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{requested.WagonNumber}: jo‘natish stansiyasini tanlang"));
                var unitProduct = !string.IsNullOrWhiteSpace(unit.ProductType)
                    ? unit.ProductType.Trim()
                    : unit.Arrival?.ProductType?.Trim() ?? "";
                if (!string.IsNullOrWhiteSpace(unitProduct)
                    && !IsProductCompatible(selectedOrder.ProductType, unitProduct))
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: buyurtma mahsuloti yuklangan mahsulotga mos emas"));
                // Muddat ixtiyoriy: qatorda belgilangan bo‘lsa, istalgan mahsulot uchun cheklaydi.
                var effectiveDeadline = selectedLine.LastLoadingDate;
                if (effectiveDeadline.HasValue)
                {
                    var today = DateTime.UtcNow.Date;
                    if (today > effectiveDeadline.Value.Date)
                    {
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                            $"{unit.WagonNumber}: «{selectedLine.Contractor}» korxonasi uchun yuklashning oxirgi sanasi ({effectiveDeadline.Value:dd.MM.yyyy}) o‘tib ketgan! Shartnoma muddati tugagani sababli yuk xati rasmiylashtirish va yuklash taqiqlanadi."));
                    }
                }
                var routeStation = ResolveRouteStation(selectedLine, requested.DestinationStation);
                if (routeStation.Length == 0 && unit.Status != EmptyWagonUnitStatuses.Returned)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{requested.WagonNumber}: «{selectedLine.Contractor}» uchun jo‘natish stansiyasini tanlang"));
                assignments[requested.WagonNumber] = (selectedOrder, selectedLine, routeStation);
            }
            var routeSnapshots = requestedRoutes.Select(x =>
            {
                var unit = unitsByNumber[x.WagonNumber];
                var defective = unit.Status == EmptyWagonUnitStatuses.Returned;
                if (defective)
                {
                    if (assignments.TryGetValue(x.WagonNumber, out var defectiveAssignment))
                    {
                        return new LoadingRegistryWagonRouteDto(
                            x.WagonNumber,
                            defectiveAssignment.Line.Id,
                            defectiveAssignment.Line.Contractor,
                            defectiveAssignment.Station,
                            true,
                            unit.LoadingComment,
                            string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActFileName : unit.DefectActNumber,
                            defectiveAssignment.Order.Id,
                            defectiveAssignment.Order.OrderNumber,
                            defectiveAssignment.Order.ProductType,
                            unit.EmptyWagonArrivalId,
                            unit.Arrival?.ArrivalNumber ?? "",
                            0,
                            LineContractNumber(defectiveAssignment.Order, defectiveAssignment.Line));
                    }
                    return new LoadingRegistryWagonRouteDto(
                        x.WagonNumber,
                        Guid.Empty,
                        "",
                        "",
                        true,
                        unit.LoadingComment,
                        string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActFileName : unit.DefectActNumber,
                        null,
                        "",
                        unit.ProductType ?? unit.Arrival?.ProductType ?? "",
                        unit.EmptyWagonArrivalId,
                        unit.Arrival?.ArrivalNumber ?? "",
                        0);
                }
                var assignment = assignments[x.WagonNumber];
                var routeLine = assignment.Line;
                return new LoadingRegistryWagonRouteDto(
                    x.WagonNumber,
                    routeLine.Id,
                    routeLine.Contractor,
                    assignment.Station,
                    false,
                    "",
                    "",
                    assignment.Order.Id,
                    assignment.Order.OrderNumber,
                    assignment.Order.ProductType,
                    unit.EmptyWagonArrivalId,
                    unit.Arrival?.ArrivalNumber ?? "",
                    UnitNetWeight(unit),
                    LineContractNumber(assignment.Order, routeLine));
            }).ToList();
            var primaryRoute = routeSnapshots.FirstOrDefault(x => !x.IsDefective);
            var primaryOrder = primaryRoute?.MonthlyOrderId is Guid primaryOrderId && ordersById.TryGetValue(primaryOrderId, out var pOrd)
                ? pOrd
                : null;
            var primaryLine = primaryRoute is not null && primaryOrder is not null
                ? primaryOrder.Lines.FirstOrDefault(x => x.Id == primaryRoute.MonthlyOrderLineId)
                : null;

            var effectiveRegistryNumber = request.RegistryNumber?.Trim();
            if (string.IsNullOrWhiteSpace(effectiveRegistryNumber))
            {
                effectiveRegistryNumber = await numberingService.GenerateWaybillNumberAsync(arrival.ArrivalNumber);
            }
            else
            {
                var duplicateNumber = await db.LoadingRegistries
                    .FirstOrDefaultAsync(r => r.RegistryNumber == effectiveRegistryNumber);
                if (duplicateNumber is not null)
                {
                    effectiveRegistryNumber = await numberingService.GenerateWaybillNumberAsync(arrival.ArrivalNumber);
                }
            }

            var repeatedWagon = requestedRoutes.FirstOrDefault(x =>
            {
                var unit = unitsByNumber[x.WagonNumber];
                return alreadyRegistered.Contains(WagonSourceKey(unit.EmptyWagonArrivalId, unit.WagonNumber))
                    || legacyRegisteredArrivals.Contains(unit.EmptyWagonArrivalId);
            });
            if (repeatedWagon is not null)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                    $"{repeatedWagon.WagonNumber}: vagon boshqa yuk xatiga avval kiritilgan"));

            var fulfilledRoutes = routeSnapshots.Where(x => !x.IsDefective).ToList();
            var fulfilledNet = fulfilledRoutes.Sum(x =>
            {
                var unit = unitsByNumber[x.WagonNumber];
                return EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var net)
                    ? Math.Max(0, net)
                    : 0;
            });
            var limitWarnings = new List<string>();
            foreach (var group in fulfilledRoutes.GroupBy(x => new { OrderId = x.MonthlyOrderId!.Value, LineId = x.MonthlyOrderLineId }))
            {
                if (!ordersById.TryGetValue(group.Key.OrderId, out var grpOrder)) continue;
                var orderLine = grpOrder.Lines.FirstOrDefault(x => x.Id == group.Key.LineId);
                if (orderLine is null) continue;
                var wagonDelta = group.Count();
                var netDelta = group.Sum(x =>
                {
                    var unit = unitsByNumber[x.WagonNumber];
                    return EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var net)
                        ? Math.Max(0, net)
                        : 0;
                });
                if (orderLine.WagonCount > 0 && orderLine.FulfilledWagonCount + wagonDelta > orderLine.WagonCount)
                {
                    var excess = orderLine.FulfilledWagonCount + wagonDelta - orderLine.WagonCount;
                    limitWarnings.Add(
                        $"{DescribeOrderLine(orderLine)}: limit ({orderLine.WagonCount} ta) to‘lgan, ortiqcha {excess} ta vagon biriktirildi");
                }
                if (orderLine.WagonCount <= 0 && orderLine.TonCount > 0
                    && orderLine.FulfilledNetWeight + netDelta > orderLine.TonCount)
                {
                    var excess = orderLine.FulfilledNetWeight + netDelta - orderLine.TonCount;
                    limitWarnings.Add(
                        $"{DescribeOrderLine(orderLine)}: limit ({orderLine.TonCount:0.###} t) to‘lgan, ortiqcha {excess:0.###} t yuk biriktirildi");
                }
            }

            var registry = new LoadingRegistry
            {
                EmptyWagonArrivalId = request.EmptyWagonArrivalId,
                RegistryNumber = effectiveRegistryNumber,
                PreparedById = userId,
                PreparedByName = CurrentUserName(),
                PreparedAt = DateTime.UtcNow,
                IsEconomistApprovedWithPermit = true,
                EconomistApprovedWithPermitAt = DateTime.UtcNow,
                IsEconomistApprovedWithSecurity = true,
                EconomistApprovedWithSecurityAt = DateTime.UtcNow,
                IsApprovedByEconomist = true,
                EconomistApprovedAt = DateTime.UtcNow,
                EconomistApprovedByName = CurrentUserName(),
                IsApprovedByShiftSupervisor = false,
                ShiftSupervisorApprovedAt = null,
                ShiftSupervisorApprovedByName = string.Empty,
                MonthlyOrderId = selectedOrders.Count == 1 ? selectedOrders[0].Id : null,
                MonthlyOrderLineId = fulfilledRoutes.Select(x => x.MonthlyOrderLineId).Distinct().Count() == 1 ? primaryLine?.Id : null,
                OrderNumber = selectedOrders.Count == 0 ? "Nomuvofiq" : selectedOrders.Count == 1 ? selectedOrders[0].OrderNumber : string.Join(", ", selectedOrders.Select(x => x.OrderNumber).Distinct()),
                ContractNumber = ResolveRegistryContract(assignments.Values, selectedOrders),
                DestinationStation = fulfilledRoutes.Count == 0
                    ? "Nomuvofiq"
                    : fulfilledRoutes.Select(x => x.DestinationStation).Distinct().Count() == 1
                        ? primaryRoute?.DestinationStation ?? ""
                        : "Bir nechta stansiya",
                ContractorName = fulfilledRoutes.Count == 0
                    ? "Nomuvofiq"
                    : fulfilledRoutes.Select(x => x.ContractorName).Distinct().Count() == 1
                        ? primaryLine?.Contractor ?? ""
                        : "Bir nechta kontragent",
                WagonRoutesJson = JsonSerializer.Serialize(routeSnapshots),
                OrderDeductedWagons = fulfilledRoutes.Count,
                OrderDeductedNetWeight = fulfilledNet,
                EmptyWagonArrival = arrival,
            };

            foreach (var group in fulfilledRoutes.GroupBy(x => new { OrderId = x.MonthlyOrderId!.Value, LineId = x.MonthlyOrderLineId }))
            {
                if (!ordersById.TryGetValue(group.Key.OrderId, out var grpOrder)) continue;
                var orderLine = grpOrder.Lines.FirstOrDefault(x => x.Id == group.Key.LineId);
                if (orderLine is null) continue;
                orderLine.FulfilledWagonCount += group.Count();
                orderLine.FulfilledNetWeight += group.Sum(x =>
                {
                    var unit = unitsByNumber[x.WagonNumber];
                    return EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var net)
                        ? Math.Max(0, net)
                        : 0;
                });
            }
            foreach (var selectedOrder in selectedOrders)
            {
                OrderFulfillment.RefreshStatus(selectedOrder);
            }

            foreach (var unit in unitsByNumber.Values.Where(u => u.Status != EmptyWagonUnitStatuses.Returned))
            {
                unit.SealConfirmedByEconomistAt ??= DateTime.UtcNow;
                if (string.IsNullOrWhiteSpace(unit.SealConfirmedByEconomistName))
                    unit.SealConfirmedByEconomistName = CurrentUserName();
                EmptyWagonUnitSync.TryCompleteSeal(unit);
            }

            var wagonRows = new List<YukXatiPdfWagonRow>();
            int idx = 1;
            foreach (var route in routeSnapshots)
            {
                if (!unitsByNumber.TryGetValue(route.WagonNumber, out var unit)) continue;
                EmptyWagonUnitSync.TryParseWeight(unit.TareWeight, out var tare);
                EmptyWagonUnitSync.TryParseWeight(unit.GrossWeight, out var brutto);
                EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var netto);

                string receiverStation;
                bool isDefective = route.IsDefective || unit.Status == EmptyWagonUnitStatuses.Returned;
                if (isDefective)
                {
                    var actNo = !string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActNumber : (!string.IsNullOrWhiteSpace(route.DefectActFileName) ? route.DefectActFileName : "Dalolatnoma");
                    receiverStation = $"Nomuvofiqlik aniqlangan · {actNo}";
                    tare = 0;
                    brutto = 0;
                    netto = 0;
                }
                else
                {
                    assignments.TryGetValue(unit.WagonNumber, out var unitAssignment);
                    receiverStation = unitAssignment.Line is not null
                        ? $"{unitAssignment.Line.Contractor} — {unitAssignment.Station}"
                        : (registry.ContractorName ?? registry.DestinationStation ?? "—");
                }

                wagonRows.Add(new YukXatiPdfWagonRow(
                    Index: idx++,
                    WagonNumber: unit.WagonNumber,
                    CisternNumber: unit.CisternNumber,
                    WagonType: unit.WagonType ?? "Vagon-sisterna",
                    ProductType: unit.ProductType ?? arrival.ProductType,
                    TareWeight: tare,
                    BruttoWeight: brutto,
                    NettoWeight: netto,
                    SealNumbers: isDefective ? null : unit.SealNumber,
                    Status: unit.Status,
                    ReceiverAndStation: receiverStation,
                    IsDefective: isDefective,
                    DefectActFileName: unit.DefectActFileName ?? unit.DefectActNumber,
                    ContractNumber: isDefective || string.IsNullOrWhiteSpace(route.ContractNumber) ? null : route.ContractNumber
                ));
            }

            var totalTareKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.TareWeight);
            var totalBruttoKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.BruttoWeight);
            var totalNettoKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.NettoWeight) > 0
                ? wagonRows.Where(w => !w.IsDefective).Sum(w => w.NettoWeight)
                : registry.OrderDeductedNetWeight;

            var warehouseSignerName = !string.IsNullOrWhiteSpace(arrival.LoadingCompletedByName) ? arrival.LoadingCompletedByName : (unitsByNumber.Values.Select(u => u.LoadingCompletedByName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "—");
            var warehouseSignerAt = arrival.LoadingCompletedAt ?? arrival.CreatedAt;
            var scaleSignerName = unitsByNumber.Values.Select(u => u.SealConfirmedByScaleName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))
                ?? "—";
            var scaleSignerAt = unitsByNumber.Values.Select(u => u.GrossWeighedAt).FirstOrDefault(t => t != null)
                ?? unitsByNumber.Values.Select(u => u.TareWeighedAt).FirstOrDefault(t => t != null)
                ?? registry.PreparedAt;
            var economistSignerName = registry.PreparedByName ?? CurrentUserName();
            var economistSignerAt = registry.PreparedAt;
            var permitSignerName = registry.PermitApprovedByName ?? "—";
            var permitSignerAt = registry.PermitApprovedAt ?? registry.PreparedAt;
            var securitySignerName = registry.SecurityApprovedByName ?? "—";
            var securitySignerAt = registry.SecurityApprovedAt ?? registry.PreparedAt;

            var signersList = new List<YukXatiPdfSigner>
            {
                new("warehouse", "Tayyor mahsulotlar va xom ashyo sexi", "Yuklandi", warehouseSignerName, warehouseSignerAt),
                new("scale", "Tarozi operatori", "Tarozida tortildi", scaleSignerName, scaleSignerAt),
                new("economist", "ICHDX iqtisodchisi", "Yuk xati shakllantirildi", economistSignerName, economistSignerAt),
                new("permit", "Ruxsatnoma byurosi xodimi", "Kelishildi", permitSignerName, permitSignerAt),
                new("security", "Qo‘riqlash xizmati (NO‘J) xodimi", "Kelishildi", securitySignerName, securitySignerAt)
            };

            var pdfBytes = pdfGenerator.GenerateYukXatiPdf(new YukXatiPdfModel(
                RegistryNumber: registry.RegistryNumber,
                OrderNumber: registry.OrderNumber,
                CustomerName: registry.ContractorName,
                DestinationStation: registry.DestinationStation,
                ProductType: arrival.ProductType ?? "Suyultirilgan gaz",
                WagonCount: wagonRows.Count,
                TotalTare: totalTareKg,
                TotalBrutto: totalBruttoKg,
                TotalNetto: totalNettoKg,
                PreparedAt: registry.PreparedAt,
                PreparedByName: registry.PreparedByName,
                InspectorName: null,
                SecurityOfficerName: registry.SecurityApprovedByName,
                QrVerificationUrl: null,
                QrGlobalId: null,
                Wagons: wagonRows,
                LoadingTaskNo: arrival.ArrivalNumber,
                ExitDate: registry.ExitedToKengsoyAt,
                ContractNo: registry.ContractNumber,
                PermitOk: registry.IsApprovedByPermit && registry.IsApprovedBySecurity,
                ShiftLeaderName: null,
                ShiftLeaderAt: registry.ShiftSupervisorApprovedAt,
                Signers: signersList
            ));

            db.LoadingRegistries.Add(registry);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            await auditService.LogAsync(
                action: "YukXatiCreated",
                entityType: nameof(LoadingRegistry),
                entityId: registry.Id.ToString(),
                details: JsonSerializer.Serialize(new
                {
                    registryNumber = registry.RegistryNumber,
                    wagonCount = requestedRoutes.Count,
                    wagonNumbers = requestedNumbers,
                    orderNumber = registry.OrderNumber,
                    contractor = registry.ContractorName,
                    destination = registry.DestinationStation,
                    arrivalId = request.EmptyWagonArrivalId
                }),
                category: "Documents"
            );

            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "YUKLASH VA CHIQARISH",
                StageTitle: "3. Yuk xatini shakllantirish",
                DepartmentOrRole: "ICHDX iqtisodchisi",
                OperatorName: CurrentUserName(),
                Identifier: registry.RegistryNumber,
                WagonCount: requestedRoutes.Count,
                WagonNumbers: requestedNumbers,
                ProductType: registry.ContractorName,
                NextStage: "4. Yuk xatini tasdiqlash",
                NextDepartment: "ICHDX smena boshlig'i",
                Details: $"Stansiya: {registry.DestinationStation}"
            ));

            var createRegMsg = limitWarnings.Count > 0
                ? $"Yuk xati shakllantirildi. Diqqat: {string.Join("; ", limitWarnings)}"
                : "Yuk xati muvaffaqiyatli shakllantirildi";
            return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry), createRegMsg));
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Error] CreateLoadingRegistry failed: {ex}");
            return StatusCode(500, new ApiResponse<LoadingRegistryDto>(false, null, $"Yuk xati yaratishda xatolik: {ex.GetBaseException().Message}"));
        }
    }

    [HttpPost("loading-registry/{id:guid}/approve-shift")]
    [RequirePermission("documents.registry.approve-shift")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> ApproveShift(Guid id)
    {
        var registry = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));
        // Ketma-ketlik: ICHDX iqtisodchisi shakllantiradi → ICHDX smena boshlig‘i tasdiqlaydi → Ruxsatnoma byurosi
        if (User.IsInRole(UserRoles.Economist) && !User.IsInRole(UserRoles.Admin))
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                "Yuk xatini ICHDX smena boshlig‘i tasdiqlaydi. Iqtisodchi o‘zi shakllantirgan yuk xatini tasdiqlay olmaydi."));
        var now = DateTime.UtcNow;
        var userName = CurrentUserName();
        registry.IsApprovedByShiftSupervisor = true;
        registry.ShiftSupervisorApprovedAt ??= now;
        registry.ShiftSupervisorApprovedByName = userName;
        registry.IsEconomistApprovedWithPermit = true;
        registry.EconomistApprovedWithPermitAt ??= now;
        registry.IsEconomistApprovedWithSecurity = true;
        registry.EconomistApprovedWithSecurityAt ??= now;
        if (string.IsNullOrWhiteSpace(registry.EconomistApprovedByName))
        {
            registry.EconomistApprovedByName = !string.IsNullOrWhiteSpace(registry.PreparedByName)
                ? registry.PreparedByName
                : userName;
        }
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "YukXatiSigned",
            entityType: nameof(LoadingRegistry),
            entityId: registry.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                registryNumber = registry.RegistryNumber,
                orderNumber = registry.OrderNumber,
                signedByName = registry.ShiftSupervisorApprovedByName
            }),
            category: "Documents"
        );

        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "YUKLASH VA CHIQARISH",
            StageTitle: "4. Yuk xatini tasdiqlash",
            DepartmentOrRole: "ICHDX smena boshlig'i",
            OperatorName: userName,
            Identifier: registry.RegistryNumber,
            WagonCount: registry.OrderDeductedWagons > 0 ? registry.OrderDeductedWagons : ParseWagonRoutes(registry.WagonRoutesJson).Count,
            WagonNumbers: ParseWagonRoutes(registry.WagonRoutesJson).Select(w => w.WagonNumber).ToList(),
            ProductType: registry.ContractorName,
            NextStage: "5. Yuk xatini kelishish",
            NextDepartment: "Ruxsatnoma byurosi",
            Details: $"Stansiya: {registry.DestinationStation}"
        ));

        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry), "Yuk xati ICHDX tomonidan tasdiqlandi"));
    }

    [HttpPost("loading-registry/{id:guid}/approve-permit")]
    [RequirePermission("documents.registry.approve-permit")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> ApprovePermit(Guid id, [FromBody] ApprovePermitRequest request)
    {
        var registry = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (registry.PreparedAt >= SequentialWorkflowStartsAt
            && !User.IsInRole(UserRoles.Permit) && !User.IsInRole(UserRoles.Admin))
            return Forbid();
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));
        if (registry.PreparedAt >= SequentialWorkflowStartsAt && registry.IsApprovedBySecurity)
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Qo‘riqlash tasdiqlagan yuk xatining ruxsatnoma kelishuvini o‘zgartirib bo‘lmaydi."));
        if (registry.PreparedAt >= SequentialWorkflowStartsAt && !registry.IsApprovedByShiftSupervisor)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                "Yuk xati avval ICHDX smena boshlig‘i tomonidan tasdiqlanishi kerak."));
        // Legacy reyestrlarda yuborish bayrog‘i bo‘lmasligi mumkin. Reyestrning
        // mavjudligi uning shakllantirilib kelishuvga chiqarilganini bildiradi.
        registry.IsEconomistApprovedWithPermit = true;
        registry.EconomistApprovedWithPermitAt ??= registry.PreparedAt;

        if (!request.Approved && string.IsNullOrWhiteSpace(request.Comment))
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Rad etishda izoh majburiy"));

        registry.IsApprovedByPermit = request.Approved;
        registry.PermitApprovedAt = request.Approved ? DateTime.UtcNow : null;
        registry.PermitApprovedByName = request.Approved ? CurrentUserName() : string.Empty;
        registry.PermitCheckResult = request.Comment?.Trim() ?? (request.Approved ? "Kelishildi" : "Kelinmadi");

        if (!request.Approved)
            registry.EmptyWagonArrival!.Stage = "RegistryPrepared";
        else if (registry.IsApprovedBySecurity)
            registry.EmptyWagonArrival!.Stage = "PermitAndSecurityApproved";

        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "YukXatiAgreed",
            entityType: nameof(LoadingRegistry),
            entityId: registry.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                registryNumber = registry.RegistryNumber,
                orderNumber = registry.OrderNumber,
                approved = request.Approved,
                approvalType = "Permit",
                comment = request.Comment,
                approvedByName = registry.PermitApprovedByName
            }),
            category: "Documents",
            status: request.Approved ? "Success" : "Failed"
        );

        if (request.Approved)
        {
            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "YUKLASH VA CHIQARISH",
                StageTitle: "5. Yuk xatini kelishish",
                DepartmentOrRole: "Ruxsatnoma byurosi",
                OperatorName: registry.PermitApprovedByName,
                Identifier: registry.RegistryNumber,
                WagonCount: registry.OrderDeductedWagons > 0 ? registry.OrderDeductedWagons : ParseWagonRoutes(registry.WagonRoutesJson).Count,
                NextStage: "6. Vagonlarni tekshirib chiqarish",
                NextDepartment: "Qo'riqlash xizmati"
            ));
        }

        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    [HttpPost("loading-registry/{id:guid}/approve-economist-permit")]
    [RequirePermission("documents.registry.approve-economist")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> ApproveEconomistWithPermit(Guid id, [FromBody] ApproveEconomistWithPermitRequest request)
    {
        var registry = await db.LoadingRegistries.Include(r => r.EmptyWagonArrival).FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));
        registry.IsEconomistApprovedWithPermit = true;
        registry.EconomistApprovedWithPermitAt ??= DateTime.UtcNow;
        registry.IsApprovedByEconomist = registry.IsEconomistApprovedWithPermit && registry.IsEconomistApprovedWithSecurity;
        registry.EconomistApprovedAt ??= registry.IsApprovedByEconomist ? DateTime.UtcNow : null;
        registry.EconomistApprovedByName = CurrentUserName();

        if (registry.IsApprovedByPermit && registry.IsApprovedBySecurity)
            registry.EmptyWagonArrival!.Stage = "PermitAndSecurityApproved";

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    [HttpPost("loading-registry/{id:guid}/approve-economist-security")]
    [RequirePermission("documents.registry.approve-economist")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> ApproveEconomistWithSecurity(Guid id, [FromBody] ApproveEconomistWithSecurityRequest request)
    {
        var registry = await db.LoadingRegistries.Include(r => r.EmptyWagonArrival).FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));
        registry.IsEconomistApprovedWithSecurity = true;
        registry.EconomistApprovedWithSecurityAt ??= DateTime.UtcNow;
        registry.IsApprovedByEconomist = registry.IsEconomistApprovedWithPermit && registry.IsEconomistApprovedWithSecurity;
        registry.EconomistApprovedAt ??= registry.IsApprovedByEconomist ? DateTime.UtcNow : null;
        registry.EconomistApprovedByName = CurrentUserName();

        if (registry.IsApprovedByPermit && registry.IsApprovedBySecurity)
            registry.EmptyWagonArrival!.Stage = "PermitAndSecurityApproved";

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    [HttpPost("loading-registry/{id:guid}/approve-security")]
    [RequirePermission("documents.registry.approve-security")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> ApproveSecurity(Guid id, [FromBody] ApproveSecurityRequest request)
    {
        var registry = await db.LoadingRegistries.Include(r => r.EmptyWagonArrival).FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (registry.PreparedAt >= SequentialWorkflowStartsAt
            && !User.IsInRole(UserRoles.Security) && !User.IsInRole(UserRoles.Admin))
            return Forbid();
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));
        if (registry.PreparedAt >= SequentialWorkflowStartsAt && !registry.IsApprovedByShiftSupervisor)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                "Yuk xati avval ICHDX smena boshlig‘i tomonidan tasdiqlanishi kerak."));
        if (!registry.IsApprovedByPermit)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                "Avval Ruxsatnoma byurosi yuk xatini kelishishi kerak"));
        // Legacy reyestrlarda yuborish bayrog‘i bo‘lmasligi mumkin. Reyestrning
        // mavjudligi uning shakllantirilib kelishuvga chiqarilganini bildiradi.
        registry.IsEconomistApprovedWithSecurity = true;
        registry.EconomistApprovedWithSecurityAt ??= registry.PreparedAt;

        if (!request.Approved && string.IsNullOrWhiteSpace(request.Comment))
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Rad etishda izoh majburiy"));

        registry.IsApprovedBySecurity = request.Approved;
        registry.SecurityApprovedAt = request.Approved ? DateTime.UtcNow : null;
        registry.SecurityApprovedByName = request.Approved ? CurrentUserName() : string.Empty;
        registry.SecurityCheckResult = request.Comment?.Trim() ?? (request.Approved ? "Kelishildi" : "Kelinmadi");

        if (!request.Approved)
            registry.EmptyWagonArrival!.Stage = "RegistryPrepared";
        else if (registry.IsApprovedByPermit)
            registry.EmptyWagonArrival!.Stage = "PermitAndSecurityApproved";

        await db.SaveChangesAsync();
        if (request.Approved) QrFinalizationWorker.Signal();

        await auditService.LogAsync(
            action: "YukXatiAgreed",
            entityType: nameof(LoadingRegistry),
            entityId: registry.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                registryNumber = registry.RegistryNumber,
                orderNumber = registry.OrderNumber,
                approved = request.Approved,
                approvalType = "Security",
                comment = request.Comment,
                approvedByName = registry.SecurityApprovedByName
            }),
            category: "Documents",
            status: request.Approved ? "Success" : "Failed"
        );

        if (request.Approved)
        {
            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "YUKLASH VA CHIQARISH",
                StageTitle: "6. Vagonlarni tekshirib chiqarish",
                DepartmentOrRole: "Qo'riqlash xizmati",
                OperatorName: registry.SecurityApprovedByName,
                Identifier: registry.RegistryNumber,
                WagonCount: registry.OrderDeductedWagons > 0 ? registry.OrderDeductedWagons : ParseWagonRoutes(registry.WagonRoutesJson).Count,
                NextStage: "7. Vagonlarni chiqarish",
                NextDepartment: "Temir yo'l"
            ));
        }

        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    [HttpPut("loading-registry/{id:guid}")]
    [RequirePermission("documents.registry.update")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> UpdateLoadingRegistry(
        Guid id,
        [FromBody] UpdateLoadingRegistryRequest request)
    {
        var registry = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));

        if (registry.IsSentToOneC || registry.IsSentToENakl)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "E-nakl ga yuborilgan yuk xatini tahrirlab bo‘lmaydi"));

        var revisionComment = request.RevisionComment?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(revisionComment))
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Saqlashdan oldin izoh majburiy"));

        var registryNumber = request.RegistryNumber?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(registryNumber))
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Yuk xati raqami bo‘sh bo‘lmasligi kerak"));

        var duplicateNumber = await db.LoadingRegistries
            .FirstOrDefaultAsync(r => r.Id != id && r.RegistryNumber == registryNumber);
        if (duplicateNumber is not null)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Bunday raqamli yuk xati allaqachon mavjud"));

        var limitWarnings = new List<string>();

        if (request.WagonRoutes is not null && request.WagonRoutes.Count > 0)
        {
            var requestedRoutes = request.WagonRoutes;
            var requestedWagonNumbers = requestedRoutes.Select(x => x.WagonNumber.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            // 1. Oldingi vagonlar bo'yicha buyurtmalardan yechilgan qoldiqlarni qaytarish (revert)
            var oldRoutes = ParseWagonRoutes(registry.WagonRoutesJson);
            var oldFulfilledRoutes = oldRoutes.Where(x => !x.IsDefective && x.MonthlyOrderId.HasValue && x.MonthlyOrderLineId != Guid.Empty).ToList();
            if (oldFulfilledRoutes.Count > 0)
            {
                var oldOrderIds = oldFulfilledRoutes.Select(x => x.MonthlyOrderId!.Value).Distinct().ToList();
                var oldOrders = await db.MonthlyOrders.Include(o => o.Lines).Where(o => oldOrderIds.Contains(o.Id)).ToListAsync();
                var oldOrdersById = oldOrders.ToDictionary(x => x.Id);
                // Qaytarish faqat shu hujjatdagi tashriflarga tegishli bo‘lishi kerak: vagon qayta kelgan
                // bo‘lsa, uning boshqa tashrifdagi nettosi buyurtmadan ayrilib ketmasligi shart.
                var oldUnitsByVisit = await LoadUnitsByVisitAsync(oldFulfilledRoutes, registry.EmptyWagonArrivalId);

                foreach (var grp in oldFulfilledRoutes.GroupBy(x => new { OrderId = x.MonthlyOrderId!.Value, LineId = x.MonthlyOrderLineId }))
                {
                    if (!oldOrdersById.TryGetValue(grp.Key.OrderId, out var grpOrder)) continue;
                    var orderLine = grpOrder.Lines.FirstOrDefault(x => x.Id == grp.Key.LineId);
                    if (orderLine is null) continue;

                    var wagonDelta = grp.Count();
                    var netDelta = grp.Sum(route => RevertNetWeight(route, registry.EmptyWagonArrivalId, oldUnitsByVisit));

                    orderLine.FulfilledWagonCount = Math.Max(0, orderLine.FulfilledWagonCount - wagonDelta);
                    orderLine.FulfilledNetWeight = Math.Max(0, orderLine.FulfilledNetWeight - netDelta);
                }

                // Qaytarishdan keyin ham bajarilgan buyurtma «Yakunlangan»da qoladi (faqat qoldiq paydo bo‘lsa — «Ijroda»)
                foreach (var oldOrder in oldOrders)
                    OrderFulfillment.RefreshStatus(oldOrder);
            }

            // 2. Yangi tanlangan vagonlarni bazadan yuklash
            var arrivalUnits = await db.EmptyWagonUnits
                .Include(u => u.Arrival)
                .Where(u => requestedWagonNumbers.Contains(u.WagonNumber))
                .ToListAsync();

            var unitsByNumber = new Dictionary<string, EmptyWagonUnit>(StringComparer.OrdinalIgnoreCase);
            foreach (var requested in requestedRoutes)
            {
                var candidates = arrivalUnits.Where(u => string.Equals(u.WagonNumber, requested.WagonNumber, StringComparison.OrdinalIgnoreCase)).ToList();
                if (candidates.Count == 0)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{requested.WagonNumber}: vagon bazada topilmadi"));
                var matches = candidates
                    .Where(u => requested.SourceArrivalId is not Guid sourceArrivalId || u.EmptyWagonArrivalId == sourceArrivalId)
                    .ToList();
                // Aniq tashrif ko‘rsatilgan bo‘lsa, topilmaganda boshqa tashrifga o‘tib ketmaymiz:
                // aks holda eskirgan sahifadagi ma’lumot noto‘g‘ri tashrifga yozilib qoladi.
                if (matches.Count == 0)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{requested.WagonNumber}: ko‘rsatilgan kirish partiyasida bu vagon topilmadi — sahifani yangilang"));
                var unit = matches
                    .OrderByDescending(u => u.TareWeighedAt)
                    .ThenByDescending(u => u.GrossWeighedAt)
                    .First();
                unitsByNumber[requested.WagonNumber] = unit;
            }

            // 3. Boshqa yuk xatlarida mavjud emasligini tekshirish
            var otherRegistries = await db.LoadingRegistries
                .Where(r => r.Id != id)
                .Select(r => new { r.EmptyWagonArrivalId, r.WagonRoutesJson })
                .ToListAsync();
            var otherRegisteredKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var other in otherRegistries)
            {
                var routes = ParseWagonRoutes(other.WagonRoutesJson);
                foreach (var r in routes)
                {
                    otherRegisteredKeys.Add(WagonSourceKey(r.SourceArrivalId ?? other.EmptyWagonArrivalId, r.WagonNumber));
                }
            }

            var repeatedWagon = requestedRoutes.FirstOrDefault(x =>
            {
                var unit = unitsByNumber[x.WagonNumber];
                return otherRegisteredKeys.Contains(WagonSourceKey(unit.EmptyWagonArrivalId, unit.WagonNumber));
            });
            if (repeatedWagon is not null)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{repeatedWagon.WagonNumber}: vagon boshqa yuk xatiga avval kiritilgan"));

            // 4. Holat va buyurtmalarni tekshirish
            foreach (var requested in requestedRoutes)
            {
                var unit = unitsByNumber[requested.WagonNumber];
                if (unit.Status == EmptyWagonUnitStatuses.ToRailwayScale)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: avval brutto/netto qayta tekshiruvini yakunlang"));
                if (unit.Status == EmptyWagonUnitStatuses.Returned)
                {
                    if (!requested.IncludeDefective && !requested.IsDefective)
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{unit.WagonNumber}: nomuvofiq vagon alohida belgilanishi kerak"));
                    if (!HasDefectAct(unit))
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{unit.WagonNumber}: Temir yo‘l dalolatnomasini tuzing"));
                    var defectiveOrderId = requested.MonthlyOrderId;
                    if (defectiveOrderId.HasValue != requested.MonthlyOrderLineId.HasValue)
                        return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                            $"{unit.WagonNumber}: nomuvofiq vagon uchun buyurtma va jo‘natish stansiyasini birga tanlang yoki ikkalasini ham bo‘sh qoldiring"));
                }
                else if (unit.Status != EmptyWagonUnitStatuses.Sealed && !EmptyWagonUnitSync.IsPlombaInstalled(unit))
                {
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: faqat plombalangan yoki dalolatnomali nomuvofiq vagon yuk xatiga kiritiladi"));
                }
                else if (!EmptyWagonUnitSync.HasMeasuredNet(unit))
                {
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{unit.WagonNumber}: faqat netto tortilgan vagon yuk xatiga kiritiladi"));
                }
            }

            var healthyRequests = requestedRoutes.Where(x => unitsByNumber[x.WagonNumber].Status != EmptyWagonUnitStatuses.Returned).ToList();
            var requestedOrderIds = requestedRoutes
                .Select(x => x.MonthlyOrderId)
                .Where(x => x.HasValue)
                .Select(x => x!.Value)
                .Distinct()
                .ToList();

            if (requestedOrderIds.Count == 0 && healthyRequests.Count > 0)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Har bir sog‘lom vagon uchun buyurtmani tanlang"));

            var selectedOrders = await db.MonthlyOrders.Include(o => o.Lines)
                .Where(o => requestedOrderIds.Contains(o.Id))
                .ToListAsync();
            var ordersById = selectedOrders.ToDictionary(x => x.Id);
            if (selectedOrders.Count != requestedOrderIds.Count)
                return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Tanlangan buyurtmalardan biri topilmadi"));

            var assignments = new Dictionary<string, (MonthlyOrder Order, MonthlyOrderLine Line, string Station)>(StringComparer.OrdinalIgnoreCase);
            foreach (var requested in requestedRoutes)
            {
                var unit = unitsByNumber[requested.WagonNumber];
                var orderId = requested.MonthlyOrderId;
                if (unit.Status == EmptyWagonUnitStatuses.Returned && orderId is null && requested.MonthlyOrderLineId is null)
                    continue;
                if (orderId is not Guid effectiveOrderId || !ordersById.TryGetValue(effectiveOrderId, out var selectedOrder))
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{requested.WagonNumber}: buyurtmani tanlang"));
                if (requested.MonthlyOrderLineId is not Guid lineId || selectedOrder.Lines.FirstOrDefault(x => x.Id == lineId) is not { } selectedLine)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{requested.WagonNumber}: jo‘natish stansiyasini tanlang"));
                var unitProduct = !string.IsNullOrWhiteSpace(unit.ProductType) ? unit.ProductType.Trim() : unit.Arrival?.ProductType?.Trim() ?? "";
                if (!string.IsNullOrWhiteSpace(unitProduct) && !IsProductCompatible(selectedOrder.ProductType, unitProduct))
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, $"{unit.WagonNumber}: buyurtma mahsuloti yuklangan mahsulotga mos emas"));
                var routeStation = ResolveRouteStation(selectedLine, requested.DestinationStation);
                if (routeStation.Length == 0 && unit.Status != EmptyWagonUnitStatuses.Returned)
                    return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                        $"{requested.WagonNumber}: «{selectedLine.Contractor}» uchun jo‘natish stansiyasini tanlang"));
                assignments[requested.WagonNumber] = (selectedOrder, selectedLine, routeStation);
            }

            var routeSnapshots = requestedRoutes.Select(x =>
            {
                var unit = unitsByNumber[x.WagonNumber];
                var defective = unit.Status == EmptyWagonUnitStatuses.Returned;
                if (defective)
                {
                    if (assignments.TryGetValue(x.WagonNumber, out var defectiveAssignment))
                    {
                        return new LoadingRegistryWagonRouteDto(
                            x.WagonNumber,
                            defectiveAssignment.Line.Id,
                            defectiveAssignment.Line.Contractor,
                            defectiveAssignment.Station,
                            true,
                            unit.LoadingComment,
                            string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActFileName : unit.DefectActNumber,
                            defectiveAssignment.Order.Id,
                            defectiveAssignment.Order.OrderNumber,
                            defectiveAssignment.Order.ProductType,
                            unit.EmptyWagonArrivalId,
                            unit.Arrival?.ArrivalNumber ?? "",
                            0,
                            LineContractNumber(defectiveAssignment.Order, defectiveAssignment.Line));
                    }
                    return new LoadingRegistryWagonRouteDto(
                        x.WagonNumber,
                        Guid.Empty,
                        "",
                        "",
                        true,
                        unit.LoadingComment,
                        string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActFileName : unit.DefectActNumber,
                        null,
                        "",
                        unit.ProductType ?? unit.Arrival?.ProductType ?? "",
                        unit.EmptyWagonArrivalId,
                        unit.Arrival?.ArrivalNumber ?? "",
                        0);
                }
                var assignment = assignments[x.WagonNumber];
                var routeLine = assignment.Line;
                return new LoadingRegistryWagonRouteDto(
                    x.WagonNumber,
                    routeLine.Id,
                    routeLine.Contractor,
                    assignment.Station,
                    false,
                    "",
                    "",
                    assignment.Order.Id,
                    assignment.Order.OrderNumber,
                    assignment.Order.ProductType,
                    unit.EmptyWagonArrivalId,
                    unit.Arrival?.ArrivalNumber ?? "",
                    UnitNetWeight(unit),
                    LineContractNumber(assignment.Order, routeLine));
            }).ToList();

            var primaryRoute = routeSnapshots.FirstOrDefault(x => !x.IsDefective);
            var primaryOrder = primaryRoute?.MonthlyOrderId is Guid pOrderId && ordersById.TryGetValue(pOrderId, out var pOrd) ? pOrd : null;
            var primaryLine = primaryRoute is not null && primaryOrder is not null
                ? primaryOrder.Lines.FirstOrDefault(x => x.Id == primaryRoute.MonthlyOrderLineId)
                : null;

            var fulfilledRoutes = routeSnapshots.Where(x => !x.IsDefective).ToList();
            var fulfilledNet = fulfilledRoutes.Sum(x =>
            {
                var unit = unitsByNumber[x.WagonNumber];
                return EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var net)
                    ? Math.Max(0, net)
                    : 0;
            });

            foreach (var group in fulfilledRoutes.GroupBy(x => new { OrderId = x.MonthlyOrderId!.Value, LineId = x.MonthlyOrderLineId }))
            {
                if (!ordersById.TryGetValue(group.Key.OrderId, out var grpOrder)) continue;
                var orderLine = grpOrder.Lines.FirstOrDefault(x => x.Id == group.Key.LineId);
                if (orderLine is null) continue;
                var wagonDelta = group.Count();
                var netDelta = group.Sum(x =>
                {
                    var unit = unitsByNumber[x.WagonNumber];
                    return EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var net)
                        ? Math.Max(0, net)
                        : 0;
                });
                if (orderLine.WagonCount > 0 && orderLine.FulfilledWagonCount + wagonDelta > orderLine.WagonCount)
                {
                    var excess = orderLine.FulfilledWagonCount + wagonDelta - orderLine.WagonCount;
                    limitWarnings.Add(
                        $"{DescribeOrderLine(orderLine)}: limit ({orderLine.WagonCount} ta) to‘lgan, ortiqcha {excess} ta vagon biriktirildi");
                }
                if (orderLine.WagonCount <= 0 && orderLine.TonCount > 0
                    && orderLine.FulfilledNetWeight + netDelta > orderLine.TonCount)
                {
                    var excess = orderLine.FulfilledNetWeight + netDelta - orderLine.TonCount;
                    limitWarnings.Add(
                        $"{DescribeOrderLine(orderLine)}: limit ({orderLine.TonCount:0.###} t) to‘lgan, ortiqcha {excess:0.###} t yuk biriktirildi");
                }

                orderLine.FulfilledWagonCount += wagonDelta;
                orderLine.FulfilledNetWeight += netDelta;
            }

            foreach (var selectedOrder in selectedOrders)
            {
                OrderFulfillment.RefreshStatus(selectedOrder);
            }

            registry.WagonRoutesJson = JsonSerializer.Serialize(routeSnapshots);
            registry.OrderDeductedWagons = fulfilledRoutes.Count;
            registry.OrderDeductedNetWeight = fulfilledNet;
            registry.MonthlyOrderId = selectedOrders.Count == 1 ? selectedOrders[0].Id : null;
            registry.MonthlyOrderLineId = fulfilledRoutes.Select(x => x.MonthlyOrderLineId).Distinct().Count() == 1 ? primaryLine?.Id : null;
            registry.OrderNumber = selectedOrders.Count == 0 ? "Nomuvofiq" : selectedOrders.Count == 1 ? selectedOrders[0].OrderNumber : string.Join(", ", selectedOrders.Select(x => x.OrderNumber).Distinct());
            registry.ContractNumber = ResolveRegistryContract(assignments.Values, selectedOrders);
            registry.DestinationStation = fulfilledRoutes.Count == 0
                ? "Nomuvofiq"
                : fulfilledRoutes.Select(x => x.DestinationStation).Distinct().Count() == 1
                    ? primaryRoute?.DestinationStation ?? ""
                    : "Bir nechta stansiya";
            registry.ContractorName = fulfilledRoutes.Count == 0
                ? "Nomuvofiq"
                : fulfilledRoutes.Select(x => x.ContractorName).Distinct().Count() == 1
                    ? primaryLine?.Contractor ?? ""
                    : "Bir nechta kontragent";

            // 5. Yuk xati PDF hujjatini qayta shakllantirish
            try
            {
                var wagonRows = new List<YukXatiPdfWagonRow>();
                int idx = 1;
                foreach (var route in routeSnapshots)
                {
                    if (!unitsByNumber.TryGetValue(route.WagonNumber, out var unit)) continue;
                    EmptyWagonUnitSync.TryParseWeight(unit.TareWeight, out var tare);
                    EmptyWagonUnitSync.TryParseWeight(unit.GrossWeight, out var brutto);
                    EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var netto);

                    string receiverStation;
                    bool isDefective = route.IsDefective || unit.Status == EmptyWagonUnitStatuses.Returned;
                    if (isDefective)
                    {
                        var actNo = !string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActNumber : (!string.IsNullOrWhiteSpace(route.DefectActFileName) ? route.DefectActFileName : "Dalolatnoma");
                        receiverStation = $"Nomuvofiqlik aniqlangan · {actNo}";
                        tare = 0;
                        brutto = 0;
                        netto = 0;
                    }
                    else
                    {
                        assignments.TryGetValue(unit.WagonNumber, out var unitAssignment);
                        receiverStation = unitAssignment.Line is not null
                            ? $"{unitAssignment.Line.Contractor} — {unitAssignment.Station}"
                            : (registry.ContractorName ?? registry.DestinationStation ?? "—");
                    }

                    wagonRows.Add(new YukXatiPdfWagonRow(
                        Index: idx++,
                        WagonNumber: unit.WagonNumber,
                        CisternNumber: unit.CisternNumber,
                        WagonType: unit.WagonType ?? "Vagon-sisterna",
                        ProductType: unit.ProductType ?? registry.EmptyWagonArrival?.ProductType ?? "Suyultirilgan gaz",
                        TareWeight: tare,
                        BruttoWeight: brutto,
                        NettoWeight: netto,
                        SealNumbers: isDefective ? null : unit.SealNumber,
                        Status: unit.Status,
                        ReceiverAndStation: receiverStation,
                        IsDefective: isDefective,
                        DefectActFileName: unit.DefectActFileName ?? unit.DefectActNumber,
                        ContractNumber: isDefective || string.IsNullOrWhiteSpace(route.ContractNumber) ? null : route.ContractNumber
                    ));
                }

                var totalTareKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.TareWeight);
                var totalBruttoKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.BruttoWeight);
                var totalNettoKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.NettoWeight) > 0
                    ? wagonRows.Where(w => !w.IsDefective).Sum(w => w.NettoWeight)
                    : registry.OrderDeductedNetWeight;

                var warehouseSignerName = !string.IsNullOrWhiteSpace(registry.EmptyWagonArrival?.LoadingCompletedByName) ? registry.EmptyWagonArrival.LoadingCompletedByName : (unitsByNumber.Values.Select(u => u.LoadingCompletedByName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "—");
                var warehouseSignerAt = registry.EmptyWagonArrival?.LoadingCompletedAt ?? registry.EmptyWagonArrival?.CreatedAt ?? registry.PreparedAt;
                var scaleSignerName = unitsByNumber.Values.Select(u => u.SealConfirmedByScaleName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))
                    ?? "—";
                var scaleSignerAt = unitsByNumber.Values.Select(u => u.GrossWeighedAt).FirstOrDefault(t => t != null)
                    ?? unitsByNumber.Values.Select(u => u.TareWeighedAt).FirstOrDefault(t => t != null)
                    ?? registry.PreparedAt;
                var economistSignerName = registry.PreparedByName ?? CurrentUserName();
                var economistSignerAt = registry.PreparedAt;

                var signersList = new List<YukXatiPdfSigner>
                {
                    new("warehouse", "Tayyor mahsulotlar va xom ashyo sexi", "Yuklandi", warehouseSignerName, warehouseSignerAt),
                    new("scale", "Tarozi operatori", "Tarozida tortildi", scaleSignerName, scaleSignerAt),
                    new("economist", "ICHDX iqtisodchisi", "Yuk xati shakllantirildi", economistSignerName, economistSignerAt),
                    new("permit", "Ruxsatnoma byurosi xodimi", "Kelishildi", "—", registry.PreparedAt),
                    new("security", "Qo‘riqlash xizmati (NO‘J) xodimi", "Kelishildi", "—", registry.PreparedAt)
                };

                var pdfBytes = pdfGenerator.GenerateYukXatiPdf(new YukXatiPdfModel(
                    RegistryNumber: registryNumber,
                    OrderNumber: registry.OrderNumber,
                    CustomerName: registry.ContractorName,
                    DestinationStation: registry.DestinationStation,
                    ProductType: registry.EmptyWagonArrival?.ProductType ?? "Suyultirilgan gaz",
                    WagonCount: wagonRows.Count,
                    TotalTare: totalTareKg,
                    TotalBrutto: totalBruttoKg,
                    TotalNetto: totalNettoKg,
                    PreparedAt: registry.PreparedAt,
                    PreparedByName: registry.PreparedByName,
                    // Avval bu yerda doim null/false qo'yilgan edi — shu sabab hujjat
                    // haqiqatda tasdiqlangan/chiqarilgan bo'lsa ham PDF'da doim
                    // "Jarayonda" va "Bosh direktor: KUTILMOQDA" ko'rinardi.
                    InspectorName: registry.PermitApprovedByName,
                    SecurityOfficerName: registry.SecurityApprovedByName,
                    QrVerificationUrl: registry.QrVerificationUrl,
                    QrGlobalId: registry.QrGlobalId,
                    Wagons: wagonRows,
                    LoadingTaskNo: registry.EmptyWagonArrival?.ArrivalNumber ?? "",
                    ExitDate: registry.ExitedToKengsoyAt,
                    ContractNo: registry.ContractNumber,
                    PermitOk: registry.IsApprovedByPermit,
                    ShiftLeaderName: registry.ShiftSupervisorApprovedByName,
                    ShiftLeaderAt: registry.ShiftSupervisorApprovedAt,
                    Signers: signersList
                ));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Warning] Failed to regenerate PDF: {ex.Message}");
            }
        }

        var wasReturned =
            (!registry.IsApprovedByPermit && !string.IsNullOrWhiteSpace(registry.PermitCheckResult))
            || (!registry.IsApprovedBySecurity && !string.IsNullOrWhiteSpace(registry.SecurityCheckResult));

        registry.RegistryNumber = registryNumber;
        registry.LastRevisionComment = revisionComment;
        registry.RevisedAt = DateTime.UtcNow;

        // Qayta kelishuv uchun holatni tiklaymiz (smena boshlig'i, ruxsatnoma va qo'riqlash qayta kelishadi)
        registry.IsApprovedByShiftSupervisor = false;
        registry.ShiftSupervisorApprovedAt = null;
        registry.ShiftSupervisorApprovedByName = string.Empty;
        registry.IsEconomistApprovedWithPermit = false;
        registry.EconomistApprovedWithPermitAt = null;
        registry.IsEconomistApprovedWithSecurity = false;
        registry.EconomistApprovedWithSecurityAt = null;
        registry.IsApprovedByEconomist = true;
        registry.EconomistApprovedAt = DateTime.UtcNow;
        registry.EconomistApprovedByName = CurrentUserName();
        registry.IsApprovedByPermit = false;
        registry.IsApprovedBySecurity = false;
        registry.PermitCheckResult = string.Empty;
        registry.SecurityCheckResult = string.Empty;

        if (registry.EmptyWagonArrival is not null)
            registry.EmptyWagonArrival.Stage = "RegistryPrepared";

        await db.SaveChangesAsync();
        var updateSuccessMsg = limitWarnings.Count > 0
            ? $"Yuk xati yangilandi. Diqqat: {string.Join("; ", limitWarnings)}"
            : (wasReturned ? "Yuk xati tahrirlandi — qayta kelishuv uchun yuborildi" : "Yuk xati yangilandi");
        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry), updateSuccessMsg));
    }

    [HttpDelete("loading-registry/{id:guid}")]
    [RequirePermission("documents.registry.delete")]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteLoadingRegistry(Guid id)
    {
        var registry = await db.LoadingRegistries.Include(r => r.EmptyWagonArrival).FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<bool>(false, false, "Reyestr topilmadi"));
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<bool>(false, false,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘chirib bo‘lmaydi."));

        if (registry.IsSentToOneC || registry.IsSentToENakl)
            return BadRequest(new ApiResponse<bool>(false, false, "E-nakl yoki 1C ga yuborilgan yuk xatini o‘chirib bo‘lmaydi"));

        var routes = ParseWagonRoutes(registry.WagonRoutesJson);
        var fulfilledRoutes = routes.Where(x => !x.IsDefective && x.MonthlyOrderId.HasValue && x.MonthlyOrderLineId != Guid.Empty).ToList();
        if (fulfilledRoutes.Count > 0)
        {
            var orderIds = fulfilledRoutes.Select(x => x.MonthlyOrderId!.Value).Distinct().ToList();
            var orders = await db.MonthlyOrders.Include(o => o.Lines).Where(o => orderIds.Contains(o.Id)).ToListAsync();
            var ordersById = orders.ToDictionary(x => x.Id);
            // Tahrirlashdagi kabi: qaytarish aynan shu hujjatdagi tashriflar bo‘yicha hisoblanadi.
            var unitsByVisit = await LoadUnitsByVisitAsync(fulfilledRoutes, registry.EmptyWagonArrivalId);

            foreach (var group in fulfilledRoutes.GroupBy(x => new { OrderId = x.MonthlyOrderId!.Value, LineId = x.MonthlyOrderLineId }))
            {
                if (!ordersById.TryGetValue(group.Key.OrderId, out var grpOrder)) continue;
                var orderLine = grpOrder.Lines.FirstOrDefault(x => x.Id == group.Key.LineId);
                if (orderLine is null) continue;

                var wagonDelta = group.Count();
                var netDelta = group.Sum(route => RevertNetWeight(route, registry.EmptyWagonArrivalId, unitsByVisit));

                orderLine.FulfilledWagonCount = Math.Max(0, orderLine.FulfilledWagonCount - wagonDelta);
                orderLine.FulfilledNetWeight = Math.Max(0, orderLine.FulfilledNetWeight - netDelta);
            }
            foreach (var order in orders)
                OrderFulfillment.RefreshStatus(order);
        }

        if (registry.EmptyWagonArrival is not null)
        {
            var otherRegistriesExist = await db.LoadingRegistries.AnyAsync(r => r.EmptyWagonArrivalId == registry.EmptyWagonArrivalId && r.Id != id);
            if (!otherRegistriesExist)
            {
                registry.EmptyWagonArrival.Stage = "Sealed";
            }
        }

        // Chiqib ketgan yuk xati o‘chirilsa, uning vagonlari zavod fondiga («Chiqishga tayyor») qaytadi:
        // chiqish belgisi (ScaleExitedAt) shu yuk xati bilan qo‘yilgan edi. Boshqa chiqib ketgan
        // yuk xatida turgan vagonlarga tegilmaydi.
        if (registry.ExitedToKengsoyAt is not null)
        {
            var routeNumbers = routes
                .Select(r => (r.WagonNumber ?? string.Empty).Trim())
                .Where(n => n.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var arrivalIds = routes
                .Where(r => r.SourceArrivalId.HasValue)
                .Select(r => r.SourceArrivalId!.Value)
                .Append(registry.EmptyWagonArrivalId)
                .Distinct()
                .ToList();
            var affectedUnits = await db.EmptyWagonUnits
                .Where(u => arrivalIds.Contains(u.EmptyWagonArrivalId) && u.ScaleExitedAt != null)
                .ToListAsync();
            if (routeNumbers.Count > 0)
                affectedUnits = affectedUnits.Where(u => routeNumbers.Contains(u.WagonNumber)).ToList();

            var otherExited = await db.LoadingRegistries.AsNoTracking()
                .Where(r => r.Id != id && r.ExitedToKengsoyAt != null)
                .Select(r => new { r.EmptyWagonArrivalId, r.WagonRoutesJson })
                .ToListAsync();
            var stillExited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var other in otherExited)
            {
                foreach (var w in ParseWagonRoutes(other.WagonRoutesJson))
                    stillExited.Add($"{(w.SourceArrivalId ?? other.EmptyWagonArrivalId)}:{(w.WagonNumber ?? string.Empty).Trim()}");
            }
            foreach (var u in affectedUnits)
            {
                if (stillExited.Contains($"{u.EmptyWagonArrivalId}:{u.WagonNumber}")) continue;
                u.ScaleExitedAt = null; // holati (Sealed) saqlanadi — vagon yana yuk xatiga tayyor
            }
            var affectedArrivals = await db.EmptyWagonArrivals
                .Where(a => arrivalIds.Contains(a.Id) && a.Stage == "Exited")
                .ToListAsync();
            foreach (var a in affectedArrivals)
                a.Stage = "Sealed";
        }

        var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "Economist";
        var fullName = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Noma'lum";
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid.TryParse(userIdStr, out var currentUserId);

        // Korzinaga faqat yuk xatining o‘z maydonlari yoziladi. Bog‘langan partiya obyekti
        // qo‘shilsa, partiya → vagon → partiya aylanmasi serializatsiyani to‘xtatadi va
        // tiklashda partiya nusxasi ikkilanib ketadi.
        var archiveSnapshot = await db.LoadingRegistries.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
        if (archiveSnapshot is null)
            return NotFound(new ApiResponse<bool>(false, false, "Reyestr topilmadi"));

        var trashItem = new RecycleBinItem
        {
            Id = Guid.NewGuid(),
            EntityType = "LoadingRegistry",
            EntityId = registry.Id,
            Title = $"Yuk xati #{registry.RegistryNumber} — {registry.DestinationStation}",
            Category = "registry",
            RelatedNumber = registry.RegistryNumber ?? string.Empty,
            FileName = string.Empty,
            ContentType = string.Empty,
            SizeBytes = 0,
            ObjectKey = string.Empty,
            DeletedById = currentUserId,
            DeletedByName = fullName,
            DeletedByRole = currentRole,
            DeletedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            DeleteReason = $"Yuk xati (reyestr) o'chirildi (#{registry.RegistryNumber}, {registry.ContractorName})",
            PayloadJson = JsonSerializer.Serialize(archiveSnapshot)
        };
        db.RecycleBinItems.Add(trashItem);

        db.LoadingRegistries.Remove(registry);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<bool>(true, true, "Yuk xati muvaffaqiyatli o‘chirildi"));
    }

    [HttpPost("loading-registry/{id:guid}/send-to-external")]
    [RequirePermission("documents.registry.send-external")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> SendToExternal(Guid id, [FromBody] SendToExternalSystemsRequest request)
    {
        var registry = await db.LoadingRegistries.Include(r => r.EmptyWagonArrival).FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));

        if (!registry.IsEconomistApprovedWithPermit || !registry.IsApprovedByPermit)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Avval ICHDX iqtisodchisi va Ruxsatnoma byurosi kelishishi kerak"));

        if (!registry.IsEconomistApprovedWithSecurity || !registry.IsApprovedBySecurity)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Avval ICHDX iqtisodchisi va Qo'riqlash xizmati kelishishi kerak"));

        // Yangi tartib: vagonlar avval Temir yo'l orqali Kengsoygacha olib chiqilgan bo'lishi kerak!
        if (!registry.ExitedToKengsoyAt.HasValue)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Avval Temir yo‘l vagonlarni Kengsoygacha olib chiqishi kerak"));

        // Economist records completion in external systems; this endpoint does not send documents.
        if (!registry.IsSentToOneC)
        {
            registry.IsSentToOneC = true;
            registry.SentToOneCAt = DateTime.UtcNow;
        }

        if (!registry.IsSentToENakl)
        {
            registry.IsSentToENakl = true;
            registry.SentToENaklAt = DateTime.UtcNow;
        }

        if (registry.EmptyWagonArrival is not null && registry.EmptyWagonArrival.Stage != "Exited")
        {
            registry.EmptyWagonArrival.Stage = "DocumentsIssued";
        }

        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "YukXatiRegistered",
            entityType: nameof(LoadingRegistry),
            entityId: registry.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                registryNumber = registry.RegistryNumber,
                orderNumber = registry.OrderNumber,
                isSentToOneC = registry.IsSentToOneC,
                isSentToENakl = registry.IsSentToENakl
            }),
            category: "Documents"
        );

        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "YUKLASH VA CHIQARISH",
            StageTitle: "7. Yuk xatini ro'yxatdan o'tkazish",
            DepartmentOrRole: "ICHDX iqtisodchisi",
            OperatorName: CurrentUserName(),
            Identifier: registry.RegistryNumber,
            WagonCount: registry.OrderDeductedWagons > 0 ? registry.OrderDeductedWagons : ParseWagonRoutes(registry.WagonRoutesJson).Count,
            NextStage: "Jarayon to'liq yakunlandi ✅",
            NextDepartment: "Tizim",
            Details: "1C va E-Nakl tizimlarida ro'yxatga olindi"
        ));

        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    /// <summary>
    /// ICHDX iqtisodchisi: kelishilgan yuk xatini Temir yo‘lga topshiradi.
    /// </summary>
    [HttpPost("loading-registry/{id:guid}/handover")]
    [RequirePermission("documents.registry.handover")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> HandoverToMachinist(Guid id, [FromBody] HandoverToMachinistRequest request)
    {
        var registry = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));
        if (IsWorkflowLocked(registry))
            return Conflict(new ApiResponse<LoadingRegistryDto>(false, null,
                "Vagonlar chiqarilgan yoki ro‘yxatdan o‘tgan yuk xatini o‘zgartirib bo‘lmaydi."));

        if (!registry.IsApprovedByPermit || !registry.IsApprovedBySecurity)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null,
                "Avval ruxsatnoma byurosi va qo‘riqlash yuk xatini kelishishi kerak"));

        registry.HandoverToMachinistAt ??= DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    /// <summary>
    /// Temir yo‘l: iqtisodchi topshirgan yuk xati bo‘yicha vagonlarni Kengsoygacha olib chiqadi.
    /// </summary>
    [HttpPost("loading-registry/{id:guid}/exit-to-kengsoy")]
    [RequirePermission("documents.registry.handover")]
    public async Task<ActionResult<ApiResponse<LoadingRegistryDto>>> ExitToKengsoy(Guid id, [FromBody] HandoverToMachinistRequest request)
    {
        var registry = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (registry is null) return NotFound(new ApiResponse<LoadingRegistryDto>(false, null, "Reyestr topilmadi"));

        if (!registry.IsApprovedByPermit || !registry.IsApprovedBySecurity)
            return BadRequest(new ApiResponse<LoadingRegistryDto>(false, null, "Avval Ruxsatnoma byurosi va Qo‘riqlash xizmati yuk xatini kelishishi kerak"));

        // Eski yozuvlarda alohida topshirish bo‘lmasa ham, ro‘yxatdan o‘tgan yuk xati chiqishga ochiq.
        registry.HandoverToMachinistAt ??= DateTime.UtcNow;

        if (registry.ExitedToKengsoyAt is null)
        {
            registry.ExitedToKengsoyAt = DateTime.UtcNow;
            registry.ExitedToKengsoyByName = CurrentUserName();
        }

        var arrival = registry.EmptyWagonArrival;
        var routes = ParseWagonRoutes(registry.WagonRoutesJson);
        var visitKeys = routes.Select(r => WagonSourceKey(
            r.SourceArrivalId ?? registry.EmptyWagonArrivalId, r.WagonNumber))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var wagonNumbers = routes.Select(r => r.WagonNumber)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var candidateUnits = await db.EmptyWagonUnits
            .Where(u => wagonNumbers.Contains(u.WagonNumber))
            .ToListAsync();
        var selectedUnits = candidateUnits
            .Where(u => visitKeys.Contains(WagonSourceKey(u.EmptyWagonArrivalId, u.WagonNumber)) || wagonNumbers.Contains(u.WagonNumber))
            .ToList();
        // Legacy documents without route rows belong only to their source arrival.
        if (routes.Count == 0 && arrival is not null)
        {
            selectedUnits = arrival.Units.ToList();
            wagonNumbers = selectedUnits.Select(u => u.WagonNumber).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
        var cisternCodes = selectedUnits
            .SelectMany(u => (u.CisternNumber ?? "").Split(['/', '|', '+'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        await CatalogParkLocationSync.MarkWagonsDepartedAsync(db, wagonNumbers);
        await CatalogParkLocationSync.MarkContainersDepartedAsync(db, cisternCodes);

        foreach (var u in selectedUnits)
        {
            u.ScaleExitedAt ??= DateTime.UtcNow;
        }

        var allRegistries = await db.LoadingRegistries.AsNoTracking()
            .Select(r => new { r.WagonRoutesJson, r.ExitedToKengsoyAt, r.Id, r.EmptyWagonArrivalId })
            .ToListAsync();
        var exitedWagons = allRegistries
            .Where(r => r.ExitedToKengsoyAt.HasValue || r.Id == registry.Id)
            .SelectMany(r => ParseWagonRoutes(r.WagonRoutesJson)
                .Select(w => WagonSourceKey(w.SourceArrivalId ?? r.EmptyWagonArrivalId, w.WagonNumber)))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var partyIds = selectedUnits.Select(u => u.EmptyWagonArrivalId).ToHashSet();
        if (arrival is not null) partyIds.Add(arrival.Id);
        var parties = await db.EmptyWagonArrivals.Include(a => a.Units)
            .Where(a => partyIds.Contains(a.Id))
            .ToListAsync();
        foreach (var party in parties)
        {
            var allUnitsExited = party.Units.Count > 0 && party.Units.All(u => u.ScaleExitedAt.HasValue || exitedWagons.Contains(WagonSourceKey(u.EmptyWagonArrivalId, u.WagonNumber)) || wagonNumbers.Contains(u.WagonNumber));
            if (allUnitsExited)
            {
                party.Stage = "Exited";
            }
            foreach (var u in party.Units.Where(u => exitedWagons.Contains(WagonSourceKey(u.EmptyWagonArrivalId, u.WagonNumber)) || wagonNumbers.Contains(u.WagonNumber)))
                u.ScaleExitedAt ??= DateTime.UtcNow;
        }

        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "WagonsDispatched",
            entityType: nameof(LoadingRegistry),
            entityId: registry.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                registryNumber = registry.RegistryNumber,
                orderNumber = registry.OrderNumber,
                wagonCount = wagonNumbers.Count,
                wagonNumbers
            }),
            category: "Operations"
        );

        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "YUKLASH VA CHIQARISH",
            StageTitle: "6. Vagonlarni chiqarish",
            DepartmentOrRole: "Temir yo'l",
            OperatorName: CurrentUserName(),
            Identifier: registry.RegistryNumber,
            WagonCount: wagonNumbers.Count,
            WagonNumbers: wagonNumbers,
            NextStage: "7. Yuk xatini ro'yxatdan o'tkazish",
            NextDepartment: "ICHDX iqtisodchisi",
            Details: "Vagonlar Kengsoy stansiyasiga jo'natildi"
        ));

        return Ok(new ApiResponse<LoadingRegistryDto>(true, existingToDto(registry)));
    }

    private static LoadingRegistryDto existingToDto(LoadingRegistry r)
    {
        var routes = ParseWagonRoutes(r.WagonRoutesJson);
        var routeProducts = routes
            .Select(x => x.ProductType?.Trim() ?? "")
            .Where(p => !string.IsNullOrWhiteSpace(p) && !p.Equals("Aralash mahsulotlar", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var product = routeProducts.Count switch
        {
            1 => routeProducts[0],
            > 1 => string.Join(", ", routeProducts),
            _ => !string.IsNullOrWhiteSpace(r.EmptyWagonArrival?.ProductType) && !r.EmptyWagonArrival.ProductType.Equals("Aralash mahsulotlar", StringComparison.OrdinalIgnoreCase)
                ? r.EmptyWagonArrival.ProductType
                : "Suyultirilgan gaz"
        };
        return new(
            r.Id,
            r.EmptyWagonArrivalId,
            r.EmptyWagonArrival?.ArrivalNumber ?? "",
            product,
            routes.Count > 0 ? routes.Count : r.EmptyWagonArrival?.WagonCount ?? 0,
            r.RegistryNumber,
            r.IsApprovedByEconomist,
            r.EconomistApprovedAt,
            r.IsEconomistApprovedWithPermit,
            r.EconomistApprovedWithPermitAt,
            r.IsEconomistApprovedWithSecurity,
            r.EconomistApprovedWithSecurityAt,
            r.IsApprovedByPermit,
            r.IsApprovedBySecurity,
            r.PermitCheckResult,
            r.SecurityCheckResult,
            r.LastRevisionComment,
            r.RevisedAt,
            r.IsSentToOneC,
            r.IsSentToENakl,
            r.SentToOneCAt,
            r.SentToENaklAt,
            r.HandoverToMachinistAt,
            r.ExitedToKengsoyAt,
            r.PreparedAt,
            r.PreparedByName,
            r.EconomistApprovedByName,
            r.PermitApprovedByName,
            r.SecurityApprovedByName,
            r.PermitApprovedAt,
            r.SecurityApprovedAt,
            r.MonthlyOrderId, r.MonthlyOrderLineId, r.OrderNumber, r.ContractNumber,
            r.ContractorName, r.DestinationStation, r.IsApprovedByShiftSupervisor,
            r.ShiftSupervisorApprovedAt, r.ShiftSupervisorApprovedByName,
            ParseWagonRoutes(r.WagonRoutesJson),
            r.OrderDeductedWagons,
            r.OrderDeductedNetWeight,
            r.QrGlobalId ?? string.Empty,
            r.QrVerificationUrl ?? string.Empty,
            r.QrCodeBase64 ?? string.Empty,
            r.QrRegisteredAt,
            r.ExitedToKengsoyByName ?? string.Empty
        );
    }

    private static List<LoadingRegistryWagonRouteDto> ParseWagonRoutes(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<LoadingRegistryWagonRouteDto>>(json) ?? []; }
        catch { return []; }
    }

    [HttpPost("sync-qrlink-files")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<object>>> SyncQrLinkFiles(
        [FromServices] QrFinalizationService finalization, CancellationToken cancellationToken)
    {
        var result = await finalization.SyncAsync(cancellationToken);
        return Ok(new ApiResponse<object>(result.Failed == 0, result));
    }

    [HttpGet("debug-qr-status")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetDebugQrStatus()
    {
        var defectUnits = await db.EmptyWagonUnits
            .Where(u => !string.IsNullOrWhiteSpace(u.DefectActNumber))
            .Select(u => new { u.Id, u.WagonNumber, u.DefectActNumber, u.DefectActQrGlobalId, u.DefectActQrVerificationUrl })
            .ToListAsync();

        var registries = await db.LoadingRegistries
            .Select(r => new { r.Id, r.RegistryNumber, r.QrGlobalId, r.QrVerificationUrl })
            .ToListAsync();

        var arrivals = await db.EmptyWagonArrivals
            .Select(a => new { a.Id, a.ArrivalNumber, a.EntryPermitNumber, a.EntryPermitQrGlobalId, a.EntryPermitQrVerificationUrl })
            .ToListAsync();

        return Ok(new { defectUnits, registries, arrivals });
    }

    [HttpGet("loading-registry/{id:guid}/pdf")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLoadingRegistryPdf(Guid id)
    {
        var reg = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.CreatedBy)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (reg is null) return NotFound("Yuk xati topilmadi");

        var pdfModel = BuildYukXatiPdfModel(reg);
        var pdfBytes = pdfGenerator.GenerateYukXatiPdf(pdfModel);

        return File(pdfBytes, "application/pdf", $"YukXati_{reg.RegistryNumber}.pdf");
    }

    private static MonthlyOrderPdfModel BuildMonthlyOrderPdfModel(MonthlyOrder order)
    {
        var lineRows = new List<MonthlyOrderPdfLineRow>();
        int idx = 1;
        foreach (var line in (order.Lines ?? []).OrderBy(l => l.SortOrder))
        {
            var wagons = line.WagonCount;
            var tons = line.TonCount;
            lineRows.Add(new MonthlyOrderPdfLineRow(
                Index: idx++,
                Contractor: line.Contractor,
                WagonCount: wagons,
                TonCount: (decimal)tons,
                ContractNumber: string.IsNullOrWhiteSpace(line.ContractNumber) ? order.ContractNumber : line.ContractNumber,
                DestinationStation: line.DestinationStation,
                ProductGrade: line.ProductGrade ?? "",
                CustomerOrderNumber: line.CustomerOrderNumber ?? ""
            ));
        }

        var totalWagons = lineRows.Sum(l => l.WagonCount);
        var totalTons = lineRows.Sum(l => l.TonCount);

        var approvedAt = order.DispatchApprovedAt
            ?? order.DeputyApprovedAt
            ?? order.ApprovedAt
            ?? order.MarketingApprovedAt;

        return new MonthlyOrderPdfModel(
            OrderNumber: order.OrderNumber,
            ProductType: order.ProductType,
            Status: order.Status.ToString(),
            ApprovedAt: approvedAt,
            DeputyApproverName: order.DeputyApproverName,
            DeputyApprovedAt: order.DeputyApprovedAt,
            MarketingApproverName: order.MarketingApproverName ?? order.CreatedBy?.FullName,
            MarketingApprovedAt: order.CreatedAt,
            AccountingApproverName: order.AccountingApproverName,
            AccountingApprovedAt: order.ApprovedAt,
            QrVerificationUrl: order.QrVerificationUrl,
            QrGlobalId: order.QrGlobalId,
            ContractNumber: order.ContractNumber,
            Lines: lineRows,
            TotalWagons: totalWagons,
            TotalTons: totalTons
        );
    }

    /// <summary>Qator shartnomasi; eski (qatorsiz) buyurtmalarda — buyurtma shartnomasi.</summary>
    private static string LineContractNumber(MonthlyOrder order, MonthlyOrderLine line) =>
        !string.IsNullOrWhiteSpace(line.ContractNumber) ? line.ContractNumber.Trim() : (order.ContractNumber ?? "").Trim();

    private static YukXatiPdfModel BuildYukXatiPdfModel(LoadingRegistry reg) => FinalDocumentModels.BuildYukXatiPdfModel(reg);

    [HttpGet("defect-act/{unitId:guid}/pdf")]
    [AllowAnonymous]
    public async Task<IActionResult> GetDefectActPdf(Guid unitId)
    {
        var unit = await db.EmptyWagonUnits.FirstOrDefaultAsync(u => u.Id == unitId);
        if (unit is null) return NotFound("Vagon topilmadi");

        var arrival = await db.EmptyWagonArrivals.Include(a => a.CreatedBy).FirstOrDefaultAsync(a => a.Id == unit.EmptyWagonArrivalId);

        if (!string.IsNullOrWhiteSpace(unit.DefectActObjectKey))
        {
            var stream = await fileStorage.DownloadAsync(unit.DefectActObjectKey);
            if (stream != null)
            {
                var contentType = unit.DefectActContentType ?? "application/pdf";
                var fn = unit.DefectActFileName ?? $"Dalolatnoma_{unit.DefectActNumber}.pdf";
                return File(stream, contentType, fn);
            }
        }

        var dispName = !string.IsNullOrWhiteSpace(unit.DefectActUploadedByName) ? unit.DefectActUploadedByName : "Dispetcher";
        var handoverName = !string.IsNullOrWhiteSpace(arrival?.CreatedBy?.FullName) ? arrival.CreatedBy.FullName : dispName;
        var scaleName = !string.IsNullOrWhiteSpace(unit.SealConfirmedByScaleName)
            ? unit.SealConfirmedByScaleName
            : (unit.WagonType == "platform" ? dispName : handoverName);

        if (string.IsNullOrWhiteSpace(unit.DefectActQrGlobalId))
        {
            var preliminaryPdf = pdfGenerator.GenerateDefectActPdf(new DefectActPdfModel(
                ActNumber: unit.DefectActNumber,
                ActType: unit.DefectActType,
                WagonNumber: unit.WagonNumber,
                CisternNumber: unit.CisternNumber,
                WagonType: unit.WagonType,
                ProductType: unit.ProductType ?? arrival?.ProductType,
                ArrivalNumber: arrival?.ArrivalNumber,
                Comment: unit.LoadingComment,
                CreatedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
                CreatedByName: dispName,
                QrVerificationUrl: null,
                QrGlobalId: null,
                DispatcherName: dispName,
                DispatcherAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
                HandoverName: handoverName,
                HandoverAt: arrival?.CreatedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
                ScaleName: scaleName,
                ScaleAt: unit.TareWeighedAt ?? unit.GrossWeighedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
                ApprovedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow
            ));
            string fileName = $"Dalolatnoma_{unit.DefectActNumber}_{unit.WagonNumber}.pdf";

            var reg = await qrLinkService.RegisterDocumentAsync(new QrLinkRegisterRequest(
                SourceDocumentId: unit.DefectActNumber,
                DocumentType: "Dalolatnoma",
                Title: $"Nomuvofiqlik dalolatnomasi № {unit.DefectActNumber} ({unit.WagonNumber})",
                Status: "Approved",
                OwnerName: dispName
            ));
            if (!string.IsNullOrWhiteSpace(reg.GlobalId))
            {
                unit.DefectActQrGlobalId = reg.GlobalId;
                unit.DefectActQrVerificationUrl = reg.VerificationUrl;
                unit.DefectActQrCodeBase64 = reg.QrCodeBase64;
                unit.DefectActQrRegisteredAt = reg.RegisteredAt;
                await db.SaveChangesAsync();
            }
        }

        var pdfBytes = pdfGenerator.GenerateDefectActPdf(new DefectActPdfModel(
            ActNumber: unit.DefectActNumber,
            ActType: unit.DefectActType,
            WagonNumber: unit.WagonNumber,
            CisternNumber: unit.CisternNumber,
            WagonType: unit.WagonType,
            ProductType: unit.ProductType ?? arrival?.ProductType,
            ArrivalNumber: arrival?.ArrivalNumber,
            Comment: unit.LoadingComment,
            CreatedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
            CreatedByName: dispName,
            QrVerificationUrl: unit.DefectActQrVerificationUrl,
            QrGlobalId: unit.DefectActQrGlobalId,
            DispatcherName: dispName,
            DispatcherAt: unit.DefectActUploadedAt ?? DateTime.UtcNow,
            HandoverName: handoverName,
            HandoverAt: arrival?.CreatedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
            ScaleName: scaleName,
            ScaleAt: unit.TareWeighedAt ?? unit.GrossWeighedAt ?? unit.DefectActUploadedAt ?? DateTime.UtcNow,
            ApprovedAt: unit.DefectActUploadedAt ?? DateTime.UtcNow
        ));

        return File(pdfBytes, "application/pdf", $"Dalolatnoma_{unit.DefectActNumber}_{unit.WagonNumber}.pdf");
    }

    /// <summary>Buyurtma qatoridagi stansiya; bo‘sh bo‘lsa yuk xatida tanlangani olinadi.</summary>






    private static bool IsProductCompatible(string? orderProduct, string? unitProduct)
    {
        if (string.IsNullOrWhiteSpace(orderProduct) || string.IsNullOrWhiteSpace(unitProduct))
            return true;
        if (string.Equals(orderProduct.Trim(), unitProduct.Trim(), StringComparison.OrdinalIgnoreCase))
            return true;

        static string Normalize(string? s)
        {
            var v = (s ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(v)) return "";
            if (v.Contains("suyultirilgan") || v.Contains("propan") || v.Contains("butan") || v.Contains("lpg") || v.Contains("spbt")) return "lpg";
            if (v.Contains("polietilen") || v.Contains("etilen") || v.Contains("pe")) return "polietilen";
            if (v.Contains("oltingugurt") || v.Contains("sulfur") || v.Contains("ol")) return "oltingugurt";
            if (v.Contains("kondensat") || v.Contains("gk")) return "kondensat";
            if (v.Contains("buten") || v.Contains("b1")) return "buten";
            return v;
        }

        var left = Normalize(orderProduct);
        var right = Normalize(unitProduct);
        return !string.IsNullOrEmpty(left) && left == right;
    }

    /// <summary>
    /// Vagon stansiyasi: qatorda bitta stansiya — o'sha; bir nechta ("Oqjar, Xayrabod") — yuk xatida tanlangani
    /// (faqat shu ro'yxatdan); qatorda yo'q — yuk xatida tanlangani. Bo'sh qaytsa — stansiya tanlanmagan.
    /// </summary>
    private static string ResolveRouteStation(MonthlyOrderLine line, string? requestedStation)
    {
        var stations = (line.DestinationStation ?? "")
            .Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var requested = requestedStation?.Trim() ?? "";
        if (stations.Count == 1) return stations[0];
        if (stations.Count == 0) return requested;
        return stations.FirstOrDefault(s => string.Equals(s, requested, StringComparison.OrdinalIgnoreCase)) ?? "";
    }

    /// <summary>Yuk xatidagi vagonlar biriktirilgan qatorlar shartnomalari (qatorda bo‘lmasa — buyurtmaniki).</summary>
    private static string ResolveRegistryContract(
        IEnumerable<(MonthlyOrder Order, MonthlyOrderLine Line, string Station)> assignments,
        IEnumerable<MonthlyOrder> selectedOrders)
    {
        var contracts = assignments
            .Select(a => string.IsNullOrWhiteSpace(a.Line.ContractNumber) ? a.Order.ContractNumber : a.Line.ContractNumber)
            .Concat(assignments.Any() ? [] : selectedOrders.Select(o => o.ContractNumber))
            .Select(x => x?.Trim() ?? "")
            .Where(x => x.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return string.Join(", ", contracts);
    }

    private static string DescribeOrderLine(MonthlyOrderLine line) =>
        string.IsNullOrWhiteSpace(line.DestinationStation)
            ? line.Contractor
            : $"{line.Contractor} ({line.DestinationStation})";

    private static string DescribeUnfinishedPendingAction(LoadingRegistry r)
    {
        if (r.IsEconomistApprovedWithPermit && !r.IsApprovedByPermit && !string.IsNullOrWhiteSpace(r.PermitCheckResult))
            return $"Ruxsatnoma byurosi rad etgan ({r.PermitCheckResult}). ICHDX iqtisodchisi ma’lumotlarni to‘g‘rilab qayta yuborishi kerak";

        if (r.IsEconomistApprovedWithSecurity && !r.IsApprovedBySecurity && !string.IsNullOrWhiteSpace(r.SecurityCheckResult) && r.SecurityCheckResult.Trim() != "Kelishildi")
            return $"Qo‘riqlash xizmati rad etgan ({r.SecurityCheckResult}). ICHDX iqtisodchisi ma’lumotlarni to‘g‘rilab qayta yuborishi kerak";

        if (!r.IsApprovedByShiftSupervisor)
            return "ICHDX smena boshlig‘i tasdig‘i kutilmoqda («Kelishildi» tugmasi hali bosilmagan)";

        if (!r.IsEconomistApprovedWithPermit && !r.IsApprovedByPermit)
            return "ICHDX iqtisodchisi yuk xatini Ruxsatnoma byurosiga yuborishi kutilmoqda («Ruxsatnomaga» tugmasi hali bosilmagan)";

        if (!r.IsApprovedByPermit)
            return "Ruxsatnoma byurosi kelishuvi kutilmoqda («Kelishildi» tugmasi hali bosilmagan)";

        if (!r.IsEconomistApprovedWithSecurity && !r.IsApprovedBySecurity)
            return "ICHDX iqtisodchisi yuk xatini Qo‘riqlash xizmatiga yuborishi kutilmoqda («Qo‘riqlashga» tugmasi hali bosilmagan)";

        if (!r.IsApprovedBySecurity)
            return "Qo‘riqlash xizmati kelishuvi kutilmoqda («Ruxsat etildi» tugmasi hali bosilmagan)";

        if (!r.ExitedToKengsoyAt.HasValue)
            return "Temir yo‘l (mashinist / dispetcher) vagonlarni Kengsoygacha olib chiqishi kutilmoqda («Vagonlarni olib chiqish» tasdig‘i hali bosilmagan)";

        if (!r.IsSentToOneC || !r.IsSentToENakl)
            return "Vagonlar chiqarilgan. Endi ICHDX iqtisodchisi «1C / E-nakl ro‘yxatini tasdiqlash» tugmasini bosishi kutilmoqda";

        return "vagonlar chiqarilib, yuk xati 1C va E-nakl uchun ro‘yxatdan o‘tkazilishi kerak";
    }
}
