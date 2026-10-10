using ETransport.Infrastructure.Notifications;
using System.Security.Claims;
using System.Globalization;
using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Core.Interfaces;
using ETransport.Infrastructure.Audit;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Pdf;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Dispatching.Controllers;

public record EmptyWagonArrivalDto(
    Guid Id,
    string ArrivalNumber,
    DateTime ArrivalDate,
    int WagonCount,
    string WagonNumbers,
    string CisternNumbers,
    string ProductType,
    string TrackNumber,
    List<string> NotifiedDepartments,
    List<string> PreparedDepartments,
    string Stage,
    string TareWeight,
    string VerifiedWagonNumbers,
    string Notes,
    string CreatedByName,
    DateTime CreatedAt,
    string LoadingComment,
    string LoadingCompletedByName,
    DateTime? LoadingCompletedAt,
    DateTime? EconomistNotifiedAt,
    string GrossWeight,
    List<EmptyWagonUnitDto> Wagons,
    string EntryPermitNumber,
    DateTime? EntryPermitShiftApprovedAt,
    string EntryPermitShiftApprovedByName,
    DateTime? EntryPermitPermitApprovedAt,
    string EntryPermitPermitApprovedByName,
    DateTime? EntryPermitSecurityApprovedAt,
    string EntryPermitSecurityApprovedByName,
    string EntryPermitQrGlobalId,
    string EntryPermitQrVerificationUrl,
    string EntryPermitQrCodeBase64,
    DateTime? EntryPermitQrRegisteredAt,
    string WagonTypes = "",
    string Ownerships = "",
    string IntakeLoadStates = "",
    DateTime? EntryPermitApprovedAt = null,
    string? EntryPermitApprovedByName = null,
    string? EntryPermitComment = null,
    bool? EntryPermitFileStored = null,
    bool EntryPermitQrCodeBase64Available = false,
    bool IsOnHold = false,
    string? HoldReason = null,
    DateTime? HeldAt = null,
    string? HeldByName = null,
    List<EmptyWagonUnitDto>? Units = null
);

public record CreateEmptyWagonArrivalRequest(
    int WagonCount,
    string? WagonNumbers,
    string? CisternNumbers,
    string? ProductType,
    string? TrackNumber,
    List<string>? NotifiedDepartments,
    string? Notes,
    Guid? SourceArrivalId = null
);

public record ConfirmPreparationRequest(string? DepartmentName);
public record UpdateStageRequest(string Stage, string? Notes = null);
public record RecordTareRequest(string TareWeight, string? VerifiedWagonNumbers, string? CisternNumbers);
public record RecordGrossRequest(string GrossWeight);
public record RecordWagonSealRequest(string SealNumber, bool EnteredToUng = true, string? DefectActNumber = null, string? Reason = null);
public record ConfirmWagonSealRequest(string? Comment = null, string? Role = null);
public record RecordInspectionRequest(
    int WagonCount,
    string? WagonNumbers,
    string? ProductType,
    string? TrackNumber,
    string? Notes,
    string? CisternNumbers = null,
    string? WagonTypes = null,
    string? Ownerships = null,
    string? IntakeLoadStates = null
);

public record UpdateEmptyWagonUnitRequest(
    string WagonNumber,
    string? CisternNumber = null,
    string? WagonType = null,
    string? Ownership = null,
    string? IntakeLoadState = null,
    string? ProductType = null
);

public record RecordWagonTareRequest(
    string TareWeight,
    string? CisternNumber = null,
    string? PlatformTareWeight = null,
    Dictionary<string, string>? ContainerTareWeights = null);
public record UpdateWagonCheckRequest(string Status, string? LoadingComment = null);
public record UpdateWagonTareWeightRequest(
    string TareWeight,
    string? CisternNumber = null,
    string? PlatformTareWeight = null,
    Dictionary<string, string>? ContainerTareWeights = null);
public record ClearWagonTareCheckRequest(string? CisternNumber = null);
public record ClearWagonTareCheckBulkRequest(string[]? WagonNumbers = null);
public record RecordWagonGrossRequest(string GrossWeight);
public record ReturnWagonFromTareRequest(string Reason);
public record ApproveEntryPermitRequest(string? Comment = null);

[ApiController]
[Route("api/empty-wagons")]
[Authorize]
public class EmptyWagonsController(
    AppDbContext db,
    IQrLinkService qrLinkService,
    IDocumentPdfGenerator pdfGenerator,
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
    private string CurrentUserName() =>
        User.FindFirstValue("fullName")
        ?? User.FindFirstValue(ClaimTypes.Name)
        ?? User.Identity?.Name
        ?? "Foydalanuvchi";

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<EmptyWagonArrivalDto>>>> GetAll()
    {
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .Where(a => !a.ArrivalNumber.StartsWith("1C-"))
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        // Har bir yozish amali (yaratish, tortish, plomba va h.k.) o'zi EnsureUnitsAsync
        // chaqiradi — shu ro'yxat deyarli har doim allaqachon sinxron keladi. Shu sabab bu
        // yerda faqat hali birorta Unit yozilmagan (eski/legacy) partiyalar uchun ishga
        // tushiramiz — har bir "GET" so'rovida BARCHA partiyani qayta ishlash o'rniga.
        var hasChanges = false;
        foreach (var arrival in arrivals.Where(a => a.Units.Count == 0))
        {
            await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
            hasChanges = true;
        }
        if (hasChanges)
        {
            await db.SaveChangesAsync();
        }

        var dtos = arrivals.Select(ToDto).ToList();
        return Ok(new ApiResponse<List<EmptyWagonArrivalDto>>(true, dtos));
    }

    [HttpPost]
    [Authorize(Roles = "Dispatching,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> Create([FromBody] CreateEmptyWagonArrivalRequest request)
    {
        // Temir yo'l xabarnoma olmaydi — bo'sh vagonlarni o'zi kiritadi
        var depts = (request.NotifiedDepartments is { Count: > 0 }
            ? request.NotifiedDepartments
            : new List<string> { "MS va MX xizmati", "TM va XA smena muxandisi", "Qo'riqlash xizmati", "Ruxsatnoma byurosi" })
            .Where(d => !string.Equals(d, "Temir yo'l sexi", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Temir yo'l kiritgan partiyani ICHDX xabarnoma qiladi.
        // Vagon raqamlari Temir yo'l kiritganidek saqlanadi — ICHDX o'zgartira olmaydi.
        if (request.SourceArrivalId is Guid sourceId && sourceId != Guid.Empty)
        {
            var source = await db.EmptyWagonArrivals
                .Include(a => a.CreatedBy)
                .Include(a => a.Units)
                .FirstOrDefaultAsync(a => a.Id == sourceId);
            if (source is null)
                return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Temir yo'l partiyasi topilmadi"));

            if (!string.Equals(source.Stage, "RailwayInspected", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Bu partiya allaqachon xabarnoma qilingan yoki Temir yo'l ko‘rigidan o‘tmagan"));

            var existingNumbers = string.IsNullOrWhiteSpace(source.VerifiedWagonNumbers)
                ? source.WagonNumbers
                : source.VerifiedWagonNumbers;
            if (string.IsNullOrWhiteSpace(existingNumbers) || source.WagonCount <= 0)
                return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Temir yo'l vagon raqamlarini kiritmagan"));

            // Mahsulot turi ixtiyoriy — keyinroq belgilanishi mumkin
            if (!string.IsNullOrWhiteSpace(request.ProductType))
                source.ProductType = request.ProductType.Trim();
            source.NotifiedDepartments = string.Join(", ", depts);
            source.EntryPermitShiftApprovedAt ??= DateTime.UtcNow;
            source.EntryPermitShiftApprovedByName = CurrentUserName();
            // ICHDX tasdiqlagach navbat Temir yo'lga o'tadi. Temir yo'l vagonlarni
            // amalda kiritgandan keyingina Ruxsatnoma byurosi va Qo'riqlash
            // tekshiruviga (SecurityInspection) o'tkazadi.
            source.Stage = "KengsoyInspection";

            await EmptyWagonUnitSync.EnsureUnitsAsync(db, source, save: false);
            await db.SaveChangesAsync();

            await auditService.LogAsync(
                action: "IntakeNoticeApproved",
                entityType: nameof(EmptyWagonArrival),
                entityId: source.Id.ToString(),
                details: JsonSerializer.Serialize(new
                {
                    arrivalNumber = source.ArrivalNumber,
                    wagonCount = source.WagonCount,
                    wagonNumbers = source.VerifiedWagonNumbers ?? source.WagonNumbers,
                    productType = source.ProductType,
                    notifiedDepartments = source.NotifiedDepartments
                }),
                category: "Operations"
            );

            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "VAGONLARNI KIRITISH",
                StageTitle: "2. Tasdiqlash va ijro uchun yo'naltirish",
                DepartmentOrRole: "ICHDX smena boshlig'i",
                OperatorName: CurrentUserName(),
                Identifier: source.ArrivalNumber,
                WagonCount: source.WagonCount,
                WagonNumbers: ParseWagonNumbers(source.VerifiedWagonNumbers ?? source.WagonNumbers),
                ProductType: source.ProductType,
                NextStage: "3. Vagonlarni kiritish",
                NextDepartment: "Temir yo'l"
            ));

            return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(source)));
        }

        return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
            "Xabarnoma faqat Temir yo'l sexi kiritgan vagonlar asosida yaratiladi"));
    }

    /// <summary>
    /// Temir yo'l sexi Kengsoyda ko'rikdan o'tkazib olib kirgan vagonlarni mustaqil kiritadi.
    /// RailwayInspected partiyasi ochiq bo‘lsa — yangi vagonlar shu partiyaga qo‘shiladi.
    /// </summary>
    [HttpPost("railway-intake")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> CreateRailwayIntake([FromBody] RecordInspectionRequest request)
    {
        if (request.WagonCount <= 0)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon soni kamida 1 ta bo'lishi kerak"));

        var numbers = ParseWagonNumbers(request.WagonNumbers);
        if (numbers.Count < request.WagonCount)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, $"Barcha {request.WagonCount} ta vagon raqamini kiriting"));

        var intakeNumbers = numbers.Take(request.WagonCount).ToList();
        var intakeCisterns = PadList(ParseCisternSlots(request.CisternNumbers), intakeNumbers.Count);
        var intakeTypes = PadList(EmptyWagonUnitSync.ParseWagonTypes(request.WagonTypes), intakeNumbers.Count);

        var rawEntries = (request.WagonNumbers ?? "")
            .Split([',', ';', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        for (var i = 0; i < intakeNumbers.Count && i < rawEntries.Count; i++)
        {
            var (_, autoCisterns) = OneCEmptyWagonSyncService.ParseWagonAndCisterns(rawEntries[i]);
            if (autoCisterns.Count > 0)
            {
                if (string.IsNullOrWhiteSpace(intakeCisterns[i]))
                {
                    intakeCisterns[i] = string.Join(" | ", autoCisterns);
                }
                if (string.IsNullOrWhiteSpace(intakeTypes[i]) || intakeTypes[i] == "sisterna")
                {
                    intakeTypes[i] = "platform";
                }
            }
        }

        var intakeOwnerships = PadList(
            EmptyWagonUnitSync.ParseOwnerships(request.Ownerships),
            intakeNumbers.Count,
            WagonOwnership.Tashqi);
        var intakeLoadStates = PadList(
            EmptyWagonUnitSync.ParseIntakeLoadStates(request.IntakeLoadStates),
            intakeNumbers.Count,
            WagonIntakeLoadState.Bosh);

        // Bir vaqtda faqat bitta KIRISH partiyasi 1–4-bosqichda bo‘lishi mumkin.
        // Ruxsatnoma + Qo‘riqlash kelishuvidan keyin vagonlar hududga qabul qilingan
        // hisoblanadi; ularning tara/yuklash/chiqish jarayoni yangi kirishni bloklamaydi.
        var hasBlockingIntake = await db.EmptyWagonArrivals.AsNoTracking().AnyAsync(a =>
            a.Stage == "KengsoyInspection"
            || a.Stage == "SecurityInspection"
            || a.Stage == ""
            || a.Stage == null);
        if (hasBlockingIntake)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Oldingi partiya ICHDX xabarnomasi, Ruxsatnoma byurosi va Qo‘riqlash kelishuvidan o‘tmaguncha yangi vagon partiyasini kiritib bo‘lmaydi"));

        var openInspected = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Stage == "RailwayInspected");

        if (openInspected is not null)
        {
            var conflictMsg = await FindOnSiteConflictMessageAsync(
                intakeNumbers,
                FlattenCisternCodes(intakeCisterns),
                excludeArrivalId: null);
            if (conflictMsg is not null)
                return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, conflictMsg));

            var existingNumbers = ParseWagonNumbers(
                string.IsNullOrWhiteSpace(openInspected.VerifiedWagonNumbers)
                    ? openInspected.WagonNumbers
                    : openInspected.VerifiedWagonNumbers);
            var existingCisterns = openInspected.Units
                .OrderBy(u => u.SortOrder)
                .Select(u => u.CisternNumber ?? "")
                .ToList();
            while (existingCisterns.Count < existingNumbers.Count) existingCisterns.Add("");
            var existingTypes = openInspected.Units
                .OrderBy(u => u.SortOrder)
                .Select(u => u.WagonType)
                .ToList();
            while (existingTypes.Count < existingNumbers.Count) existingTypes.Add("");
            var existingOwnerships = openInspected.Units
                .OrderBy(u => u.SortOrder)
                .Select(u => string.IsNullOrWhiteSpace(u.Ownership) ? WagonOwnership.Tashqi : u.Ownership)
                .ToList();
            while (existingOwnerships.Count < existingNumbers.Count) existingOwnerships.Add(WagonOwnership.Tashqi);
            var existingLoadStates = openInspected.Units
                .OrderBy(u => u.SortOrder)
                .Select(u => WagonIntakeLoadState.Normalize(u.IntakeLoadState))
                .ToList();
            while (existingLoadStates.Count < existingNumbers.Count) existingLoadStates.Add(WagonIntakeLoadState.Bosh);

            existingNumbers.AddRange(intakeNumbers);
            existingCisterns.AddRange(intakeCisterns);
            existingTypes.AddRange(intakeTypes);
            existingOwnerships.AddRange(intakeOwnerships);
            existingLoadStates.AddRange(intakeLoadStates);

            openInspected.WagonCount = existingNumbers.Count;
            openInspected.WagonNumbers = string.Join(", ", existingNumbers);
            openInspected.VerifiedWagonNumbers = openInspected.WagonNumbers;
            openInspected.CisternNumbers = string.Join(", ", existingCisterns);
            if (!string.IsNullOrWhiteSpace(request.Notes))
            {
                openInspected.Notes = string.IsNullOrWhiteSpace(openInspected.Notes)
                    ? request.Notes.Trim()
                    : $"{openInspected.Notes.Trim()}; {request.Notes.Trim()}";
            }

            await EmptyWagonUnitSync.EnsureUnitsAsync(db, openInspected, save: false);
            foreach (var unit in openInspected.Units.Where(u => intakeNumbers.Contains(u.WagonNumber, StringComparer.OrdinalIgnoreCase)))
                unit.ProductType = request.ProductType?.Trim() ?? string.Empty;
            SyncArrivalProductSummary(openInspected);
            EmptyWagonUnitSync.ApplyCisternNumbers(openInspected, existingCisterns);
            EmptyWagonUnitSync.ApplyWagonTypes(openInspected, existingTypes);
            EmptyWagonUnitSync.ApplyOwnerships(openInspected, existingOwnerships);
            EmptyWagonUnitSync.ApplyIntakeLoadStates(openInspected, existingLoadStates);
            EmptyWagonUnitSync.SyncMirrors(openInspected);
            await CatalogParkLocationSync.UpsertContainersOnSiteAsync(db, FlattenCisternCodes(intakeCisterns));
            await CatalogParkLocationSync.UpsertWagonsOnSiteAsync(db, intakeNumbers, existingOwnerships, existingTypes);
            await db.SaveChangesAsync();

            await auditService.LogAsync(
                action: "EmptyWagonIntake",
                entityType: nameof(EmptyWagonArrival),
                entityId: openInspected.Id.ToString(),
                details: JsonSerializer.Serialize(new
                {
                    arrivalNumber = openInspected.ArrivalNumber,
                    wagonCount = intakeNumbers.Count,
                    wagonNumbers = intakeNumbers,
                    productType = request.ProductType,
                    isAppended = true
                }),
                category: "Operations"
            );

            return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(openInspected)));
        }

        var conflictNew = await FindOnSiteConflictMessageAsync(
            intakeNumbers,
            FlattenCisternCodes(intakeCisterns),
            excludeArrivalId: null);
        if (conflictNew is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, conflictNew));

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var userId = !string.IsNullOrEmpty(userIdStr) ? Guid.Parse(userIdStr) : Guid.Empty;
        var user = await db.Users.FindAsync(userId);

        var arrivalNumber = await numberingService.GenerateInboundBatchNumberAsync();
        var permitNumber = await numberingService.GenerateEntryPermitNumberAsync();
        var compact = string.Join(", ", intakeNumbers);

        var entity = new EmptyWagonArrival
        {
            Id = Guid.NewGuid(),
            ArrivalNumber = arrivalNumber,
            ArrivalDate = DateTime.UtcNow,
            WagonCount = request.WagonCount,
            WagonNumbers = compact,
            VerifiedWagonNumbers = compact,
            CisternNumbers = string.Join(", ", intakeCisterns),
            ProductType = string.IsNullOrWhiteSpace(request.ProductType) ? string.Empty : request.ProductType.Trim(),
            TrackNumber = request.TrackNumber?.Trim() ?? "1-yo'l",
            NotifiedDepartments = string.Empty,
            PreparedDepartments = "Temir yo'l sexi",
            Stage = "RailwayInspected",
            Notes = request.Notes?.Trim() ?? string.Empty,
            CreatedById = userId,
            CreatedBy = user,
            CreatedAt = DateTime.UtcNow,
            EntryPermitNumber = permitNumber,
        };

        db.EmptyWagonArrivals.Add(entity);
        await db.SaveChangesAsync();
        await EmptyWagonUnitSync.EnsureUnitsAsync(db, entity, save: false);
        foreach (var unit in entity.Units)
            unit.ProductType = request.ProductType?.Trim() ?? string.Empty;
        SyncArrivalProductSummary(entity);
        EmptyWagonUnitSync.ApplyCisternNumbers(entity, intakeCisterns);
        EmptyWagonUnitSync.ApplyWagonTypes(entity, intakeTypes);
        EmptyWagonUnitSync.ApplyOwnerships(entity, intakeOwnerships);
        EmptyWagonUnitSync.ApplyIntakeLoadStates(entity, intakeLoadStates);
        EmptyWagonUnitSync.SyncMirrors(entity);
        await CatalogParkLocationSync.UpsertContainersOnSiteAsync(db, FlattenCisternCodes(intakeCisterns));
        await CatalogParkLocationSync.UpsertWagonsOnSiteAsync(db, intakeNumbers, intakeOwnerships, intakeTypes);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "EmptyWagonIntake",
            entityType: nameof(EmptyWagonArrival),
            entityId: entity.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                arrivalNumber = entity.ArrivalNumber,
                wagonCount = entity.WagonCount,
                wagonNumbers = intakeNumbers,
                productType = entity.ProductType,
                trackNumber = entity.TrackNumber
            }),
            category: "Operations"
        );

        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "VAGONLARNI KIRITISH",
            StageTitle: "1. Vagonlarni kiritish uchun Xizmat xati",
            DepartmentOrRole: "Temir yo'l",
            OperatorName: CurrentUserName(),
            Identifier: entity.ArrivalNumber,
            WagonCount: entity.WagonCount,
            WagonNumbers: intakeNumbers,
            ProductType: entity.ProductType,
            NextStage: "2. Tasdiqlash va ijro uchun yo'naltirish",
            NextDepartment: "ICHDX smena boshlig'i"
        ));

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(entity)));
    }

    [HttpPost("{id:guid}/entry-permit/approve")]
    [Authorize(Roles = "Permit,Security,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ApproveEntryPermit(
        Guid id, [FromBody] ApproveEntryPermitRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Partiya topilmadi"));
        if (arrival.EntryPermitShiftApprovedAt is null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Avval ICHDX smena boshlig‘i xabarnomani tasdiqlashi kerak"));
        EmptyWagonUnitSync.RestorePendingEntryStage(arrival);
        if (!string.Equals(arrival.Stage, "SecurityInspection", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagonlar 4-bosqich tekshiruviga yetmagan"));

        var isAdmin = User.IsInRole("Admin");
        var isPermit = User.IsInRole("Permit");
        var isSecurity = User.IsInRole("Security");

        if (isSecurity && arrival.EntryPermitPermitApprovedAt is null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Avval Ruxsatnoma byurosi vagon kiritish buyurtmasini kelishishi kerak"));

        var isPermitAction = false;
        var isSecurityAction = false;

        // Administrator ham tartibni buzmaydi: birinchi chaqiruv — Ruxsatnoma,
        // keyingi chaqiruv — Qo‘riqlash yakuniy kelishuvi.
        if (isPermit || (isAdmin && arrival.EntryPermitPermitApprovedAt is null))
        {
            arrival.EntryPermitPermitApprovedAt ??= DateTime.UtcNow;
            arrival.EntryPermitPermitApprovedByName = CurrentUserName();
            isPermitAction = true;
        }
        else if (isSecurity || isAdmin)
        {
            arrival.EntryPermitSecurityApprovedAt ??= DateTime.UtcNow;
            arrival.EntryPermitSecurityApprovedByName = CurrentUserName();
            isSecurityAction = true;
        }

        if (isPermitAction)
        {
            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "VAGONLARNI KIRITISH",
                StageTitle: "4. Vagonlarni kiritishni kelishish",
                DepartmentOrRole: "Ruxsatnoma byurosi",
                OperatorName: arrival.EntryPermitPermitApprovedByName,
                Identifier: arrival.ArrivalNumber,
                WagonCount: arrival.WagonCount,
                WagonNumbers: ParseWagonNumbers(arrival.VerifiedWagonNumbers ?? arrival.WagonNumbers),
                ProductType: arrival.ProductType,
                NextStage: "5. Vagonlarni tekshirish va kiritish",
                NextDepartment: "Qo'riqlash xizmati"
            ));
        }

        if (isSecurityAction)
        {
            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "VAGONLARNI KIRITISH",
                StageTitle: "5. Vagonlarni tekshirish va kiritish",
                DepartmentOrRole: "Qo'riqlash xizmati",
                OperatorName: arrival.EntryPermitSecurityApprovedByName,
                Identifier: arrival.ArrivalNumber,
                WagonCount: arrival.WagonCount,
                WagonNumbers: ParseWagonNumbers(arrival.VerifiedWagonNumbers ?? arrival.WagonNumbers),
                ProductType: arrival.ProductType,
                NextStage: "6. Tara tekshiruvi",
                NextDepartment: "Tarozibon"
            ));
        }

        if (arrival.EntryPermitPermitApprovedAt is not null && arrival.EntryPermitSecurityApprovedAt is not null)
        {
            arrival.Stage = "ReadyForEstakada";
            AppendStageNotes(arrival, request.Comment, "Kirish buyurtmasi kelishildi");

            var permitNo = string.IsNullOrWhiteSpace(arrival.EntryPermitNumber) ? arrival.ArrivalNumber : arrival.EntryPermitNumber;
            var wagonRows = (arrival.Units ?? new List<EmptyWagonUnit>()).Select((u, i) => new EntryPermitPdfWagonRow(
                Index: i + 1,
                WagonNumber: u.WagonNumber,
                CisternNumber: u.CisternNumber,
                WagonType: !string.IsNullOrWhiteSpace(u.WagonType) ? u.WagonType : "Vagon-sisterna",
                ProductType: !string.IsNullOrWhiteSpace(u.ProductType) ? u.ProductType : (!string.IsNullOrWhiteSpace(arrival.ProductType) ? arrival.ProductType : string.Empty),
                Status: u.Status
            )).ToList();

            var pdfBytes = pdfGenerator.GenerateEntryPermitPdf(new EntryPermitPdfModel(
                PermitNumber: permitNo,
                ArrivalNumber: arrival.ArrivalNumber,
                ProductType: arrival.ProductType,
                WagonCount: arrival.WagonCount,
                CreatedAt: arrival.CreatedAt,
                CreatedByName: arrival.CreatedBy?.FullName ?? "Temir yo'l operatori",
                QrVerificationUrl: null,
                QrGlobalId: null,
                Wagons: wagonRows,
                ShiftLeaderName: arrival.EntryPermitShiftApprovedByName,
                ShiftLeaderAt: arrival.EntryPermitShiftApprovedAt,
                ShiftLeaderApproved: arrival.EntryPermitShiftApprovedAt != null,
                PermitOfficerName: arrival.EntryPermitPermitApprovedByName,
                PermitOfficerAt: arrival.EntryPermitPermitApprovedAt,
                SecurityOfficerName: arrival.EntryPermitSecurityApprovedByName,
                SecurityOfficerAt: arrival.EntryPermitSecurityApprovedAt,
                ApprovedAt: arrival.EntryPermitSecurityApprovedAt ?? DateTime.UtcNow,
                IsDone: true
            ));

            if (!arrival.ArrivalNumber.StartsWith("1C-") && !permitNo.StartsWith("1C-"))
            {
                try
                {
                    var qr = await qrLinkService.RegisterDocumentAsync(new QrLinkRegisterRequest(
                        SourceDocumentId: permitNo,
                        DocumentType: "Kirish xizmat xati",
                        Title: $"Kirish xizmat xati № {permitNo}",
                        Status: "Approved",
                        OwnerName: CurrentUserName()
                    ));
                    arrival.EntryPermitQrGlobalId = qr.GlobalId;
                    arrival.EntryPermitQrVerificationUrl = qr.VerificationUrl;
                    arrival.EntryPermitQrCodeBase64 = qr.QrCodeBase64;
                    arrival.EntryPermitQrRegisteredAt = qr.RegisteredAt;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Warning] Failed to register entry permit with QrLink: {ex.Message}");
                }
            }
        }
        await db.SaveChangesAsync();
        QrFinalizationWorker.Signal();

        if (isPermitAction)
        {
            await auditService.LogAsync(
                action: "PermitChecked",
                entityType: nameof(EmptyWagonArrival),
                entityId: arrival.Id.ToString(),
                details: JsonSerializer.Serialize(new
                {
                    arrivalNumber = arrival.ArrivalNumber,
                    permitNumber = arrival.EntryPermitNumber,
                    comment = request.Comment,
                    approvedByName = arrival.EntryPermitPermitApprovedByName
                }),
                category: "Security"
            );
        }

        if (isSecurityAction)
        {
            await auditService.LogAsync(
                action: "SecurityChecked",
                entityType: nameof(EmptyWagonArrival),
                entityId: arrival.Id.ToString(),
                details: JsonSerializer.Serialize(new
                {
                    arrivalNumber = arrival.ArrivalNumber,
                    permitNumber = arrival.EntryPermitNumber,
                    stage = arrival.Stage,
                    comment = request.Comment,
                    approvedByName = arrival.EntryPermitSecurityApprovedByName
                }),
                category: "Security"
            );
        }

        var message = arrival.Stage == "ReadyForEstakada"
            ? "Qo‘riqlash xizmati yakuniy kelishuvni berdi — vagon kiritish buyurtmasi yakunlandi"
            : "Ruxsatnoma byurosi kelishdi — Qo‘riqlash xizmati kelishuvi kutilmoqda";
        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival), message));
    }

    [HttpPost("{id:guid}/confirm-preparation")]
    [Authorize(Roles = "Marketing,Warehouse,Security,Railway,Dispatching,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ConfirmPreparation(Guid id, [FromBody] ConfirmPreparationRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        var deptName = string.IsNullOrWhiteSpace(request.DepartmentName) ? "TM va XA smena muxandisi" : request.DepartmentName.Trim();
        var preparedList = (arrival.PreparedDepartments ?? "")
            .Split(',')
            .Select(d => d.Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

        if (!preparedList.Contains(deptName, StringComparer.OrdinalIgnoreCase))
        {
            preparedList.Add(deptName);
            arrival.PreparedDepartments = string.Join(", ", preparedList);
            await db.SaveChangesAsync();
        }

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    [HttpPost("{id:guid}/update-stage")]
    [Authorize(Roles = "Railway,Security,Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> UpdateStage(Guid id, [FromBody] UpdateStageRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);

        if (!string.IsNullOrWhiteSpace(request.Stage))
        {
            var stage = request.Stage.Trim();
            var role = User.IsInRole("Admin") ? "Admin"
                : User.IsInRole("Security") ? "Security"
                : User.IsInRole("Scale") ? "Scale"
                : "Railway";

            if (string.Equals(stage, "SecurityInspection", StringComparison.OrdinalIgnoreCase))
            {
                if (role is not ("Railway" or "Admin"))
                    return StatusCode(403,
                        new ApiResponse<EmptyWagonArrivalDto>(false, null, "Ruxsat yo‘q"));
                if (!string.Equals(arrival.Stage, "KengsoyInspection", StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(arrival.Stage))
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Avval Temir yo‘l qabulini yakunlash kerak."));
                if (arrival.EntryPermitShiftApprovedAt is null)
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Avval ICHDX smena boshlig‘i xabarnomani tasdiqlashi kerak."));
                arrival.Stage = "SecurityInspection";
                TryNotifyTelegram(new TelegramStageEvent(
                    FlowTitle: "VAGONLARNI KIRITISH",
                    StageTitle: "3. Vagonlarni kiritish",
                    DepartmentOrRole: "Temir yo'l",
                    OperatorName: CurrentUserName(),
                    Identifier: arrival.ArrivalNumber,
                    WagonCount: arrival.WagonCount,
                    WagonNumbers: ParseWagonNumbers(arrival.VerifiedWagonNumbers ?? arrival.WagonNumbers),
                    ProductType: arrival.ProductType,
                    NextStage: "4. Vagonlarni kiritishni kelishish",
                    NextDepartment: "Ruxsatnoma byurosi"
                ));
            }
            else if (string.Equals(stage, "ReadyForEstakada", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(stage, "TareWeighing", StringComparison.OrdinalIgnoreCase))
            {
                // Qo‘riqlash tekshirib kiritadi → tara (tarozi), so‘ng estakada
                if (role is not ("Security" or "Admin" or "Railway"))
                    return StatusCode(403,
                        new ApiResponse<EmptyWagonArrivalDto>(false, null, "Ruxsat yo‘q"));
                if (role == "Security"
                    && !string.Equals(arrival.Stage, "SecurityInspection", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Faqat qo‘riqlash tekshiruvidagi vagonlarni kiritish mumkin."));
                if (arrival.EntryPermitPermitApprovedAt is null || arrival.EntryPermitSecurityApprovedAt is null)
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Avval Ruxsatnoma byurosi va Qo‘riqlash xizmati vagon kiritish buyurtmasini kelishishi kerak."));
                arrival.Stage = "ReadyForEstakada";
                AppendStageNotes(arrival, request.Notes, role == "Security" ? "Qo‘riqlash" : null);
                // Keyingi: Temir yo‘l tarozisi tara tortadi → Temir yo‘l estakadaga uzatadi
            }
            else if (string.Equals(stage, "KengsoyInspection", StringComparison.OrdinalIgnoreCase))
            {
                var reason = (request.Notes ?? "").Trim();
                if (reason.Length < 3)
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Kamchilik yoki xato sababini yozing (kamida 3 belgi)."));

                if (string.Equals(arrival.Stage, "SecurityInspection", StringComparison.OrdinalIgnoreCase)
                    && role is "Security" or "Admin")
                {
                    // Qo‘riqlash: kamchilik — Temir yo‘lga qaytarish
                    arrival.Stage = "KengsoyInspection";
                    AppendStageNotes(arrival, reason, "Qo‘riqlash kamchilik");
                }
                else if (arrival.Stage is ("ReadyForEstakada" or "TareWeighing")
                         && role is ("Scale" or "Admin"))
                {
                    // Tarozi: yuki bor / xato — estakadaga bermay Temir yo‘lga qaytarish
                    arrival.Stage = "KengsoyInspection";
                    AppendStageNotes(arrival, reason, "Tara kamchilik");
                }
                else
                {
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Bu partiyani hozirgi bosqichdan Temir yo‘lga qaytarib bo‘lmaydi."));
                }
            }
            else if (string.Equals(stage, "EstakadaPlaced", StringComparison.OrdinalIgnoreCase))
            {
                if (role is not ("Railway" or "Admin" or "Scale" or "Warehouse" or "Dispatching" or "DispatchSupervisor"))
                    return StatusCode(403,
                        new ApiResponse<EmptyWagonArrivalDto>(false, null, "Ruxsat yo‘q"));
                if (arrival.Stage is "Exited" or "Cancelled")
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Ushbu partiya yopilgan yoki bekor qilingan."));
                try
                {
                    EmptyWagonUnitSync.PromoteToEstakada(arrival);
                }
                catch (InvalidOperationException ex)
                {
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, ex.Message));
                }
            }
            else
            {
                if (role is not ("Railway" or "Admin"))
                    return StatusCode(403,
                        new ApiResponse<EmptyWagonArrivalDto>(false, null, "Ruxsat yo‘q"));
                arrival.Stage = stage;
            }

            await db.SaveChangesAsync();
        }

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    [HttpPost("{id:guid}/record-tare")]
    [Authorize(Roles = "Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> RecordTare(Guid id, [FromBody] RecordTareRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        if (!EmptyWagonUnitSync.HasEntryApprovals(arrival))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Avval ICHDX smena boshlig‘i, Ruxsatnoma byurosi va Qo‘riqlash kirish tasdiqlarini yakunlang."));
        if (arrival.Stage is "RegistryPrepared" or "PermitAndSecurityApproved" or "DocumentsIssued" or "Exited" or "Cancelled")
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Ushbu partiyaning kirish jarayoni yopilgan."));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);

        arrival.DailyPlanLineId = null;
        arrival.TareWeight = request.TareWeight?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(request.VerifiedWagonNumbers))
        {
            arrival.VerifiedWagonNumbers = request.VerifiedWagonNumbers.Trim();
            arrival.WagonNumbers = request.VerifiedWagonNumbers.Trim();
        }
        if (!string.IsNullOrWhiteSpace(request.CisternNumbers))
            arrival.CisternNumbers = request.CisternNumbers.Trim();

        // Batch tara → har bir vagonni yangilash
        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        foreach (var u in arrival.Units)
        {
            if (string.IsNullOrWhiteSpace(u.TareWeight)) continue;
            if (u.Status == EmptyWagonUnitStatuses.AwaitingTare)
                u.Status = EmptyWagonUnitStatuses.Tared;
            u.TareWeighedAt ??= DateTime.UtcNow;
        }

        // Tara jarayon bosqichi emas (UNG chiqishda) — stage ni orqaga qaytarmaymiz.
        if (arrival.Stage is "RailwayInspected" or "KengsoyInspection" or "SecurityInspection" or "TareWeighing" or "")
            arrival.Stage = "ReadyForEstakada";

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        EmptyWagonUnitSync.PromoteToEstakadaWhenTareComplete(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "TareWeighed",
            entityType: nameof(EmptyWagonArrival),
            entityId: arrival.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                arrivalNumber = arrival.ArrivalNumber,
                tareWeight = arrival.TareWeight,
                wagonNumbers = arrival.VerifiedWagonNumbers ?? arrival.WagonNumbers,
                cisternNumbers = arrival.CisternNumbers
            }),
            category: "Weighing"
        );

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Tara tekshiruvi: vagon bo‘sh / mos — og‘irliksiz o‘tkazish (tara 1C dan chiqishda).
    /// </summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/clear-tare-check")]
    [Authorize(Roles = "Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ClearWagonTareCheck(
        Guid id, string wagonNumber, [FromBody] ClearWagonTareCheckRequest? request = null)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        if (!EmptyWagonUnitSync.HasEntryApprovals(arrival))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Avval kirish kelishuvlarini yakunlang."));
        if (arrival.Stage is "Exited" or "Cancelled")
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Ushbu partiyaning jarayoni yopilgan."));
        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (unit.Status == EmptyWagonUnitStatuses.Returned || unit.ScaleExitedAt is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon allaqachon qaytarilgan."));

        if (!string.IsNullOrWhiteSpace(request?.CisternNumber))
            unit.CisternNumber = request.CisternNumber.Trim();

        unit.TareCheckedAt ??= DateTime.UtcNow;
        if (unit.Status == EmptyWagonUnitStatuses.AwaitingTare)
            unit.Status = EmptyWagonUnitStatuses.Estakada;

        arrival.DailyPlanLineId = null;
        if (arrival.Stage is not ("Loading" or "Loaded" or "ToRailwayScale" or "GrossWeighed" or "SealInstallation" or "Sealed" or "DocumentsIssued" or "RegistryPrepared"))
            arrival.Stage = "EstakadaPlaced";

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        EmptyWagonUnitSync.PromoteToEstakadaWhenTareComplete(arrival);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Tara tekshiruvi: tanlangan (yoki barcha kutilayotgan) vagonlarni birga o‘tkazish.
    /// </summary>
    [HttpPost("{id:guid}/clear-tare-check")]
    [Authorize(Roles = "Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ClearWagonTareCheckBulk(
        Guid id, [FromBody] ClearWagonTareCheckBulkRequest? request = null)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        if (!EmptyWagonUnitSync.HasEntryApprovals(arrival))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Avval kirish kelishuvlarini yakunlang."));
        if (arrival.Stage is "Exited" or "Cancelled")
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Ushbu partiyaning jarayoni yopilgan."));
        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);

        var requested = (request?.WagonNumbers ?? Array.Empty<string>())
            .Select(n => n.Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var candidates = arrival.Units
            .Where(u => u.Status != EmptyWagonUnitStatuses.Returned && u.ScaleExitedAt is null)
            .Where(u => requested.Count == 0
                || requested.Any(n => string.Equals(n, u.WagonNumber, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (candidates.Count == 0)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Tekshiruvdan o‘tkaziladigan vagon topilmadi."));

        var now = DateTime.UtcNow;
        foreach (var unit in candidates)
        {
            unit.TareCheckedAt ??= now;
            if (unit.Status == EmptyWagonUnitStatuses.AwaitingTare)
                unit.Status = EmptyWagonUnitStatuses.Estakada;
        }

        arrival.DailyPlanLineId = null;
        if (arrival.Stage is not ("Loading" or "Loaded" or "ToRailwayScale" or "GrossWeighed" or "SealInstallation" or "Sealed" or "DocumentsIssued" or "RegistryPrepared"))
            arrival.Stage = "EstakadaPlaced";

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        EmptyWagonUnitSync.PromoteToEstakadaWhenTareComplete(arrival);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Brutto tekshiruvi: bitta vagonni plomba o'rnatish bosqichiga o'tkazish.
    /// </summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/clear-gross-check")]
    [Authorize(Roles = "Scale,Railway,Admin,Warehouse,Dispatching,DispatchSupervisor")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ClearWagonGrossCheck(
        Guid id, string wagonNumber)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (unit.Status == EmptyWagonUnitStatuses.Returned)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon allaqachon qaytarilgan."));

        if (!EmptyWagonUnitSync.HasMeasuredNet(unit) || unit.ScaleExitedAt is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Avval tara va brutto/netto ma’lumotlari to‘liq shakllanishi kerak."));
        unit.GrossWeighedAt ??= DateTime.UtcNow;
        // Plombalashga jo'natish: vagon plomba o'rnatish bosqichiga o'tadi
        if (unit.Status is not EmptyWagonUnitStatuses.Sealed)
            unit.Status = EmptyWagonUnitStatuses.SealPending;

        arrival.DailyPlanLineId = null;
        if (arrival.Stage is not "Sealed")
            arrival.Stage = "SealInstallation";

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Brutto tekshiruvi: tanlangan yoki barcha kutilayotgan vagonlarni birga plomba o'rnatish bosqichiga o'tkazish.
    /// </summary>
    [HttpPost("{id:guid}/clear-gross-check")]
    [Authorize(Roles = "Scale,Railway,Admin,Warehouse,Dispatching,DispatchSupervisor")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ClearWagonGrossCheckBulk(
        Guid id, [FromBody] ClearWagonTareCheckBulkRequest? request = null)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);

        var requested = (request?.WagonNumbers ?? Array.Empty<string>())
            .Select(n => n.Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var candidates = arrival.Units
            .Where(u => u.Status != EmptyWagonUnitStatuses.Returned && u.ScaleExitedAt is null)
            .Where(u => requested.Count == 0
                || requested.Any(n => string.Equals(n, u.WagonNumber, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (candidates.Count == 0)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Plomba o'rnatishga o‘tkaziladigan vagon topilmadi."));

        if (candidates.Any(u => !EmptyWagonUnitSync.HasMeasuredNet(u)))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Tanlangan vagonlarda tara va brutto/netto ma’lumotlari to‘liq emas."));

        var now = DateTime.UtcNow;
        foreach (var unit in candidates)
        {
            unit.GrossWeighedAt ??= now;
            if (unit.Status is not EmptyWagonUnitStatuses.Sealed)
                unit.Status = EmptyWagonUnitStatuses.SealPending;
        }

        arrival.DailyPlanLineId = null;
        if (arrival.Stage is not "Sealed")
            arrival.Stage = "SealInstallation";

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>Bitta vagon tara og‘irligi — faqat tarozi operatori (ixtiyoriy / legacy; asosan 1C).</summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/tare")]
    [Authorize(Roles = "Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> RecordWagonTare(
        Guid id, string wagonNumber, [FromBody] RecordWagonTareRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        if (!EmptyWagonUnitSync.HasEntryApprovals(arrival))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Avval ICHDX smena boshlig‘i, Ruxsatnoma byurosi va Qo‘riqlash kirish tasdiqlarini yakunlang."));
        if (arrival.Stage is "RegistryPrepared" or "PermitAndSecurityApproved" or "DocumentsIssued" or "Exited" or "Cancelled")
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Ushbu partiyaning kirish jarayoni yopilgan."));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (string.IsNullOrWhiteSpace(request.TareWeight))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Tara og‘irligini kiriting"));

        if (!EmptyWagonUnitSync.TryParseWeight(request.TareWeight, out _))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Tara qiymati noto‘g‘ri"));

        var normalizedTare = request.TareWeight.Trim().Replace(',', '.').Replace(" tn", "", StringComparison.OrdinalIgnoreCase).Trim();
        unit.PlatformTareWeight = string.Empty;
        unit.ContainerTareWeights = string.Empty;

        unit.TareWeight = normalizedTare;
        if (!string.IsNullOrWhiteSpace(request.CisternNumber))
            unit.CisternNumber = request.CisternNumber.Trim();
        unit.TareWeighedAt = DateTime.UtcNow;
        if (unit.Status is EmptyWagonUnitStatuses.AwaitingTare or EmptyWagonUnitStatuses.Tared)
            unit.Status = EmptyWagonUnitStatuses.Tared;

        arrival.DailyPlanLineId = null;
        if (arrival.Stage is "RailwayInspected" or "KengsoyInspection" or "SecurityInspection" or "TareWeighing" or "")
            arrival.Stage = "ReadyForEstakada";

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        EmptyWagonUnitSync.PromoteToEstakadaWhenTareComplete(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "TareWeighed",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                tareWeight = unit.TareWeight,
                cisternNumber = unit.CisternNumber,
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Weighing"
        );

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Tara: bitta vagon nuqsoni (yuki bor, bo‘sh emas, xato) — estakadaga bermay qaytarish.
    /// Qolgan vagonlar tara tekshiruvi/estakada davom etishi mumkin.
    /// </summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/return-from-tare")]
    [Authorize(Roles = "Scale,Railway,Admin,Dispatching")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ReturnWagonFromTare(
        Guid id, string wagonNumber, [FromBody] ReturnWagonFromTareRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 3)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Nuqson yoki kamchilik sababini yozing (kamida 3 belgi)."));

        if (arrival.Stage is "Loaded" or "GrossWeighed" or "SealInstallation" or "SealPending" or "Sealed" or "Exited" or "Cancelled")
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Yuklangan yoki muhrlangan vagonni tara orqali qaytarib bo‘lmaydi."));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (unit.Status is EmptyWagonUnitStatuses.Estakada
            or EmptyWagonUnitStatuses.Loading
            or EmptyWagonUnitStatuses.Loaded
            or EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Sealed)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Bu vagon allaqachon estakada/yuklashda — tara qaytarish mumkin emas."));

        if (unit.Status == EmptyWagonUnitStatuses.Returned)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon allaqachon qaytarilgan."));

        unit.Status = EmptyWagonUnitStatuses.Returned;
        unit.LoadingComment = reason;
        unit.TareWeight = string.Empty;
        unit.TareWeighedAt = null;
        AppendStageNotes(arrival, reason, $"Tara nomuvofiqlik · {unit.WagonNumber}");

        arrival.DailyPlanLineId = null;
        EmptyWagonUnitSync.SyncMirrors(arrival);

        var active = arrival.Units.Where(u => u.Status != EmptyWagonUnitStatuses.Returned).ToList();
        if (active.Count == 0)
        {
            // Partiyada faol vagon qolmadi — Temir yo‘l olib chiqishi / tuzatishi kerak
            arrival.Stage = "KengsoyInspection";
        }
        else
        {
            EmptyWagonUnitSync.DerivePartyStage(arrival);
            EmptyWagonUnitSync.PromoteToEstakadaWhenTareComplete(arrival);
        }

        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "WagonReturned",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                reason,
                stage = "Tare",
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Operations",
            status: "Warning"
        );

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Brutto tortishda ortiqcha yuk aniqlangan vagonni TM/XA ga yukni kamaytirish uchun qaytarish.
    /// Bu nomuvofiqlik emas: vagon yuklash oqimiga qaytadi va qayta brutto tortiladi.
    /// </summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/return-from-gross")]
    [Authorize(Roles = "Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ReturnWagonFromGross(
        Guid id, string wagonNumber, [FromBody] ReturnWagonFromTareRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan vagon topilmadi"));

        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 3)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Qaytarish sababini yozing (kamida 3 belgi)."));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (unit.Status is not (EmptyWagonUnitStatuses.Loaded or EmptyWagonUnitStatuses.GrossWeighed))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Faqat brutto tortishga kelgan yoki brutto tortilgan vagon qaytariladi."));

        if (!string.IsNullOrWhiteSpace(unit.SealNumber) || unit.SealedAt is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Plomba o‘rnatilgan vagonni yuklashga qaytarib bo‘lmaydi."));

        unit.Status = EmptyWagonUnitStatuses.Loading;
        unit.GrossWeight = string.Empty;
        unit.GrossWeighedAt = null;
        unit.LoadingCompletedAt = null;
        unit.LoadingCompletedByName = string.Empty;
        unit.LoadingComment = reason;
        AppendStageNotes(arrival, reason, $"Bruttodan yuklashga qaytarildi · {unit.WagonNumber}");

        arrival.DailyPlanLineId = null;
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "WagonReturned",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                reason,
                stage = "Gross",
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Operations",
            status: "Warning"
        );

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival),
            "Vagon yukni kamaytirish uchun TM va XA ga qaytarildi."));
    }

    /// <summary>
    /// Yuklangan vagonlar brutto og‘irligi (Temir yo‘l tarozisi). Netto = brutto − tara.
    /// </summary>
    [HttpPost("{id:guid}/record-gross")]
    [Authorize(Roles = "Scale,Railway,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> RecordGross(Guid id, [FromBody] RecordGrossRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);

        if (!string.Equals(arrival.Stage, "Loaded", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(arrival.Stage, "GrossWeighed", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(arrival.Stage, "ToRailwayScale", StringComparison.OrdinalIgnoreCase)
            && !arrival.Units.Any(u => u.Status is EmptyWagonUnitStatuses.Loaded or EmptyWagonUnitStatuses.GrossWeighed))
        {
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Brutto faqat yuklash tugagan vagonlar uchun kiritiladi"));
        }

        if (string.IsNullOrWhiteSpace(request.GrossWeight))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Brutto og‘irligini kiriting"));

        arrival.DailyPlanLineId = null;
        arrival.GrossWeight = request.GrossWeight.Trim();
        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        foreach (var u in arrival.Units.Where(u => !string.IsNullOrWhiteSpace(u.GrossWeight)))
        {
            u.Status = EmptyWagonUnitStatuses.GrossWeighed;
            u.GrossWeighedAt ??= DateTime.UtcNow;
        }

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "GrossWeighed",
            entityType: nameof(EmptyWagonArrival),
            entityId: arrival.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                arrivalNumber = arrival.ArrivalNumber,
                grossWeight = arrival.GrossWeight,
                wagonNumbers = arrival.VerifiedWagonNumbers ?? arrival.WagonNumbers
            }),
            category: "Weighing"
        );

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>Bitta vagon brutto og‘irligi (netto = brutto − tara).</summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/gross")]
    [Authorize(Roles = "Scale,Railway,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> RecordWagonGross(
        Guid id, string wagonNumber, [FromBody] RecordWagonGrossRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (unit.Status is not (EmptyWagonUnitStatuses.Loaded or EmptyWagonUnitStatuses.GrossWeighed))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Brutto faqat yuklash tugagan vagon uchun kiritiladi"));

        // Tara ixtiyoriy: UNG ma’lumoti odatda chiqishda keladi; netto tara bo‘lsa hisoblanadi

        if (string.IsNullOrWhiteSpace(request.GrossWeight)
            || !EmptyWagonUnitSync.TryParseWeight(request.GrossWeight, out _))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Brutto og‘irligini kiriting"));

        unit.GrossWeight = request.GrossWeight.Trim().Replace(',', '.').Replace(" tn", "", StringComparison.OrdinalIgnoreCase).Trim();
        unit.Status = EmptyWagonUnitStatuses.GrossWeighed;
        unit.GrossWeighedAt = DateTime.UtcNow;
        arrival.DailyPlanLineId = null;

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "GrossWeighed",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                grossWeight = unit.GrossWeight,
                tareWeight = unit.TareWeight,
                netWeight = EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight),
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Weighing"
        );

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Temir yo‘l taroziboni: plomba raqamini qayd etadi va UNG tizimiga kiritadi.
    /// </summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/seal")]
    [Authorize(Roles = "Scale,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> RecordWagonSeal(
        Guid id, string wagonNumber, [FromBody] RecordWagonSealRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        var hasMeasuredNet = EmptyWagonUnitSync.TryParseWeight(unit.TareWeight, out var tare)
            && EmptyWagonUnitSync.TryParseWeight(unit.GrossWeight, out var gross)
            && tare > 0
            && gross > tare;
        if (unit.Status is not (EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Sealed)
            && !(unit.Status == EmptyWagonUnitStatuses.ToRailwayScale && hasMeasuredNet))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Plomba faqat brutto/netto aniqlangan vagon uchun qayd etiladi"));

        if (string.IsNullOrWhiteSpace(request.SealNumber))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Plomba raqamini kiriting"));

        var sealNumber = request.SealNumber.Trim().ToUpperInvariant();
        var duplicateSeal = await db.EmptyWagonUnits
            .AsNoTracking()
            .Where(u => u.Id != unit.Id && u.SealNumber != "")
            .Select(u => new { u.WagonNumber, u.SealNumber })
            .FirstOrDefaultAsync(u => u.SealNumber.ToUpper() == sealNumber);
        if (duplicateSeal is not null)
            return Conflict(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                $"{sealNumber} plomba raqami {duplicateSeal.WagonNumber} vagonda avval ishlatilgan"));

        var userName = User.FindFirstValue("fullName")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "Tarozi operatori";
        var isEdit = !string.IsNullOrWhiteSpace(unit.SealNumber) && !string.Equals(unit.SealNumber, sealNumber, StringComparison.OrdinalIgnoreCase);
        var oldSealNumber = unit.SealNumber;
        unit.SealNumber = sealNumber;
        unit.Status = EmptyWagonUnitStatuses.SealPending;
        unit.SealConfirmedByScaleAt = DateTime.UtcNow;
        unit.SealConfirmedByScaleName = userName;
        unit.SealConfirmedBySecurityAt = null;
        unit.SealConfirmedBySecurityName = null;

        var hasDefectNumber = !string.IsNullOrWhiteSpace(request.DefectActNumber);
        var hasReason = !string.IsNullOrWhiteSpace(request.Reason);

        if (hasDefectNumber)
        {
            unit.DefectActNumber = request.DefectActNumber!.Trim();
            unit.DefectActType = "SealBroken";
            unit.DefectActUploadedAt = DateTime.UtcNow;
            unit.DefectActUploadedByName = userName;
        }
        else if (isEdit || hasReason)
        {
            unit.DefectActNumber = await numberingService.GenerateSealDefectActNumberAsync();
            unit.DefectActType = "SealBroken";
            unit.DefectActUploadedAt = DateTime.UtcNow;
            unit.DefectActUploadedByName = userName;
        }

        if (hasReason)
        {
            unit.LoadingComment = request.Reason!.Trim();
        }
        else if (isEdit && string.IsNullOrWhiteSpace(unit.LoadingComment))
        {
            unit.LoadingComment = "Plomba shikastlanganligi sababli yangilandi";
        }

        if (request.EnteredToUng)
            unit.SealEnteredToUngAt = DateTime.UtcNow;
        else if (unit.SealEnteredToUngAt is null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Ma'lumotlarni UNG tarozi tizimiga kiritilganligini belgilang"));

        EmptyWagonUnitSync.TryCompleteSeal(unit);
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        if (string.Equals(arrival.Stage, "Sealed", StringComparison.OrdinalIgnoreCase))
            arrival.EconomistNotifiedAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: isEdit ? "SealEdited" : "SealInstalled",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                oldSealNumber = oldSealNumber,
                sealNumber = unit.SealNumber,
                defectActNumber = unit.DefectActNumber,
                reason = unit.LoadingComment,
                isEdit,
                enteredToUng = request.EnteredToUng,
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Security"
        );

        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "YUKLASH VA CHIQARISH",
            StageTitle: "2. Plomba o'rnatildi (Zaxiraga o'tdi)",
            DepartmentOrRole: "Temir yo'l taroziboni",
            OperatorName: userName,
            Identifier: arrival.ArrivalNumber,
            WagonCount: 1,
            WagonNumbers: [unit.WagonNumber],
            ProductType: arrival.ProductType,
            NextStage: "3. Yuk xatini shakllantirish",
            NextDepartment: "ICHDX iqtisodchisi",
            Details: $"Vagon #{unit.WagonNumber} ga plomba o'rnatildi (#{unit.SealNumber}). Zaxiraga o'tkazildi, yuk xati tayyorlash mumkin."
        ));

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Plomba o‘rnatish tasdiqlari: Tarozibon (1), ICHDX iqtisodchisi (2), Qo‘riqlash xizmati (3).
    /// </summary>
    [HttpPost("{id:guid}/wagons/{wagonNumber}/seal/confirm")]
    [Authorize(Roles = "Scale,Economist,Security,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> ConfirmWagonSeal(
        Guid id, string wagonNumber, [FromBody] ConfirmWagonSealRequest? request)
    {
        _ = request;
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        if (unit.Status is not (EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Sealed))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Avval brutto/netto aniqlanishi kerak"));

        if (string.IsNullOrWhiteSpace(unit.SealNumber))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Avval plomba raqamini kiriting yoki 1C dan kelishini kuting. Plomba raqamisiz tasdiqlab bo‘lmaydi."));

        var userName = User.FindFirstValue("fullName")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "Foydalanuvchi";
        var isAdmin = User.IsInRole("Admin");
        var confirmed = false;
        var targetRole = request?.Role?.Trim();
        var canDoScale = isAdmin || User.IsInRole("Scale");
        var canDoEconomist = isAdmin || User.IsInRole("Economist");
        var canDoSecurity = isAdmin || User.IsInRole("Security");

        var doScale = string.Equals(targetRole, "Scale", StringComparison.OrdinalIgnoreCase)
            || (string.IsNullOrWhiteSpace(targetRole) && User.IsInRole("Scale") && !User.IsInRole("Security") && !isAdmin);

        var doSecurity = string.Equals(targetRole, "Security", StringComparison.OrdinalIgnoreCase)
            || (string.IsNullOrWhiteSpace(targetRole) && User.IsInRole("Security") && !User.IsInRole("Scale") && !isAdmin);

        var doEconomist = string.Equals(targetRole, "Economist", StringComparison.OrdinalIgnoreCase)
            || (string.IsNullOrWhiteSpace(targetRole) && User.IsInRole("Economist") && !isAdmin);

        // Agar Admin rol ko'rsatmasdan chaqirsa, barcha tasdiqlarni to'ldiradi
        if (isAdmin && string.IsNullOrWhiteSpace(targetRole))
        {
            unit.SealConfirmedByScaleAt ??= DateTime.UtcNow;
            unit.SealConfirmedByScaleName = string.IsNullOrWhiteSpace(unit.SealConfirmedByScaleName)
                ? userName
                : unit.SealConfirmedByScaleName;

            unit.SealEnteredToUngAt ??= DateTime.UtcNow;

            unit.SealConfirmedByEconomistAt ??= DateTime.UtcNow;
            unit.SealConfirmedByEconomistName = string.IsNullOrWhiteSpace(unit.SealConfirmedByEconomistName)
                ? userName
                : unit.SealConfirmedByEconomistName;

            unit.SealConfirmedBySecurityAt ??= DateTime.UtcNow;
            unit.SealConfirmedBySecurityName = string.IsNullOrWhiteSpace(unit.SealConfirmedBySecurityName)
                ? userName
                : unit.SealConfirmedBySecurityName;

            confirmed = true;
        }
        else
        {
            if (doScale && canDoScale)
            {
                unit.SealConfirmedByScaleAt = DateTime.UtcNow;
                unit.SealConfirmedByScaleName = userName;
                unit.SealEnteredToUngAt ??= DateTime.UtcNow;
                unit.Status = EmptyWagonUnitStatuses.SealPending;
                confirmed = true;
            }

            if (doEconomist && canDoEconomist)
            {
                if (unit.SealConfirmedByScaleAt is null)
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Avval tarozibon plomba va UNG ma'lumotini kiritib tasdiqlashi kerak"));
                unit.SealConfirmedByEconomistAt = DateTime.UtcNow;
                unit.SealConfirmedByEconomistName = userName;
                confirmed = true;
            }

            if (doSecurity && canDoSecurity)
            {
                if (unit.SealConfirmedByScaleAt is null)
                    return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                        "Avval tarozibon plomba va UNG ma'lumotini kiritib qo‘riqlashga o‘tkazishi kerak"));
                unit.SealConfirmedBySecurityAt = DateTime.UtcNow;
                unit.SealConfirmedBySecurityName = userName;
                confirmed = true;
            }
        }

        if (!confirmed)
            return Forbid();

        EmptyWagonUnitSync.TryCompleteSeal(unit);
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        if (string.Equals(arrival.Stage, "Sealed", StringComparison.OrdinalIgnoreCase))
            arrival.EconomistNotifiedAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync();

        var confirmedRole = isAdmin ? "Admin" : User.IsInRole("Scale") ? "Scale" : User.IsInRole("Economist") ? "Economist" : "Security";
        await auditService.LogAsync(
            action: "SealConfirmed",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                sealNumber = unit.SealNumber,
                confirmedRole,
                confirmedBy = userName,
                isFullySealed = unit.Status == EmptyWagonUnitStatuses.Sealed,
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Security"
        );

        var isAllSealed = string.Equals(arrival.Stage, "Sealed", StringComparison.OrdinalIgnoreCase);
        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "YUKLASH VA CHIQARISH",
            StageTitle: isAllSealed ? "2. Plomba to'liq tasdiqlandi (Barcha vagonlar tayyor)" : "2. Plomba tasdiqlandi (Zaxiraga o'tdi)",
            DepartmentOrRole: confirmedRole == "Security" ? "Qo'riqlash xizmati" : confirmedRole == "Scale" ? "Tarozibon" : confirmedRole == "Economist" ? "ICHDX iqtisodchisi" : "Nazoratchi",
            OperatorName: userName,
            Identifier: arrival.ArrivalNumber,
            WagonCount: isAllSealed ? arrival.WagonCount : 1,
            WagonNumbers: isAllSealed ? arrival.Units.Where(u => u.Status == EmptyWagonUnitStatuses.Sealed).Select(u => u.WagonNumber).ToList() : [unit.WagonNumber],
            ProductType: arrival.ProductType,
            NextStage: "3. Yuk xatini shakllantirish",
            NextDepartment: "ICHDX iqtisodchisi",
            Details: $"Vagon #{unit.WagonNumber} plombasi (#{unit.SealNumber}) tasdiqlandi va zaxiraga o'tdi. Yuk xati shakllantirish mumkin."
        ));

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    [HttpPost("{id:guid}/record-inspection")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> RecordInspection(Guid id, [FromBody] RecordInspectionRequest request)
    {
        if (request.WagonCount <= 0)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon soni kamida 1 ta bo'lishi kerak"));

        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        var numbers = (request.WagonNumbers ?? string.Empty)
            .Split(',')
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        if (numbers.Count < request.WagonCount)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, $"Barcha {request.WagonCount} ta vagon raqamini kiriting"));

        var intakeNumbers = numbers.Take(request.WagonCount).ToList();
        var intakeCisterns = PadList(ParseCisternSlots(request.CisternNumbers), intakeNumbers.Count);
        var intakeTypes = PadList(EmptyWagonUnitSync.ParseWagonTypes(request.WagonTypes), intakeNumbers.Count);
        var intakeOwnerships = PadList(
            EmptyWagonUnitSync.ParseOwnerships(request.Ownerships),
            intakeNumbers.Count,
            WagonOwnership.Tashqi);
        var intakeLoadStates = PadList(
            EmptyWagonUnitSync.ParseIntakeLoadStates(request.IntakeLoadStates),
            intakeNumbers.Count,
            WagonIntakeLoadState.Bosh);
        var conflictMsg = await FindOnSiteConflictMessageAsync(
            intakeNumbers,
            FlattenCisternCodes(intakeCisterns),
            excludeArrivalId: id);
        if (conflictMsg is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, conflictMsg));

        arrival.WagonCount = request.WagonCount;
        var compactNumbers = string.Join(", ", intakeNumbers);
        arrival.WagonNumbers = compactNumbers;
        arrival.VerifiedWagonNumbers = compactNumbers;
        arrival.CisternNumbers = string.Join(", ", intakeCisterns);
        if (!string.IsNullOrWhiteSpace(request.ProductType))
            arrival.ProductType = request.ProductType.Trim();
        if (!string.IsNullOrWhiteSpace(request.TrackNumber))
            arrival.TrackNumber = request.TrackNumber.Trim();
        arrival.Notes = request.Notes?.Trim() ?? arrival.Notes;

        // ICHDX hali xabardor qilmagan bo‘lsa — Temir yo'l kiritgan holatda qoladi
        var notified = SplitCsv(arrival.NotifiedDepartments);
        if (notified.Count == 0 || string.Equals(arrival.Stage, "RailwayInspected", StringComparison.OrdinalIgnoreCase))
            arrival.Stage = "RailwayInspected";
        else if (arrival.Stage is "TareWeighing")
            arrival.Stage = "ReadyForEstakada";
        // Aks holda joriy bosqichni saqlaymiz (Kengsoy / Security / Estakada …)

        var preparedList = SplitCsv(arrival.PreparedDepartments);
        if (!preparedList.Contains("Temir yo'l sexi", StringComparer.OrdinalIgnoreCase))
        {
            preparedList.Add("Temir yo'l sexi");
            arrival.PreparedDepartments = string.Join(", ", preparedList);
        }

        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival, save: false);
        EmptyWagonUnitSync.ApplyWagonTypes(arrival, intakeTypes);
        EmptyWagonUnitSync.ApplyOwnerships(arrival, intakeOwnerships);
        EmptyWagonUnitSync.ApplyIntakeLoadStates(arrival, intakeLoadStates);
        await CatalogParkLocationSync.UpsertContainersOnSiteAsync(db, FlattenCisternCodes(intakeCisterns));
        await CatalogParkLocationSync.UpsertWagonsOnSiteAsync(db, intakeNumbers, intakeOwnerships, intakeTypes);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Temir yo‘l: vagon ma’lumotini tahrirlash (ICHDX oldidan yoki qo‘riqlashdan qaytganda).
    /// </summary>
    [HttpPut("{arrivalId:guid}/units/{unitId:guid}")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> UpdateUnit(
        Guid arrivalId,
        Guid unitId,
        [FromBody] UpdateEmptyWagonUnitRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == arrivalId);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Partiya topilmadi"));

        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && !CanRailwayEditIntakeUnits(arrival.Stage))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Faqat qabul yoki qo‘riqlashdan qaytarilgan partiyani tahrirlash mumkin"));

        var unit = arrival.Units.FirstOrDefault(u => u.Id == unitId);
        if (unit is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon topilmadi"));

        var (parsedNumber, parsedCisterns) = OneCEmptyWagonSyncService.ParseWagonAndCisterns(request.WagonNumber);
        var number = DigitsOnlyWagon(parsedNumber);
        if (number.Length != 8)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon raqami 8 xonali bo‘lishi kerak"));

        if (arrival.Units.Any(u =>
                u.Id != unitId
                && string.Equals(u.WagonNumber.Trim(), number, StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Bu vagon raqami shu partiyada allaqachon bor"));

        var cistern = string.IsNullOrWhiteSpace(request.CisternNumber)
            ? (parsedCisterns.Count > 0 ? string.Join(", ", parsedCisterns) : "")
            : request.CisternNumber.Trim();
        var conflictMsg = await FindOnSiteConflictMessageAsync(
            [number],
            FlattenCisternCodes([cistern]),
            excludeArrivalId: arrival.Id);
        if (conflictMsg is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, conflictMsg));

        var wagonType = string.IsNullOrWhiteSpace(request.WagonType)
            ? (parsedCisterns.Count > 0 ? "platform" : unit.WagonType)
            : (parsedCisterns.Count > 0 && request.WagonType == "sisterna" ? "platform" : request.WagonType.Trim());
        var ownership = string.IsNullOrWhiteSpace(request.Ownership)
            ? WagonOwnership.Normalize(unit.Ownership)
            : WagonOwnership.Normalize(request.Ownership);

        var oldNumber = unit.WagonNumber;
        unit.WagonNumber = number;
        unit.CisternNumber = cistern;
        unit.WagonType = wagonType;
        unit.Ownership = ownership;
        if (!string.IsNullOrWhiteSpace(request.IntakeLoadState))
            unit.IntakeLoadState = WagonIntakeLoadState.Normalize(request.IntakeLoadState);
        if (request.ProductType is not null)
            unit.ProductType = request.ProductType.Trim();
        SyncArrivalProductSummary(arrival);

        if (isAdmin && !CanRailwayEditIntakeUnits(arrival.Stage) && !string.Equals(oldNumber, number, StringComparison.OrdinalIgnoreCase))
        {
            AppendStageNotes(arrival, $"Vagon {oldNumber} -> {number} (Admin tomonidan o‘zgartirildi)", "Admin");
        }

        EmptyWagonUnitSync.SyncMirrors(arrival);
        if (!string.IsNullOrWhiteSpace(cistern))
            await CatalogParkLocationSync.UpsertContainersOnSiteAsync(db, FlattenCisternCodes([cistern]));
        await CatalogParkLocationSync.UpsertWagonsOnSiteAsync(db, [number], [unit.Ownership], [unit.WagonType]);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Temir yo‘l: mavjud partiyaga yangi vagon qo‘shish.
    /// </summary>
    [HttpPost("{arrivalId:guid}/units")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<EmptyWagonArrivalDto>>> CreateUnit(
        Guid arrivalId,
        [FromBody] UpdateEmptyWagonUnitRequest request)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == arrivalId);

        if (arrival is null)
            return NotFound(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Partiya topilmadi"));

        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && !CanRailwayEditIntakeUnits(arrival.Stage))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null,
                "Faqat qabul yoki qo‘riqlashdan qaytarilgan partiyaga vagon qo‘shish mumkin"));

        var (parsedCreateNumber, parsedCreateCisterns) = OneCEmptyWagonSyncService.ParseWagonAndCisterns(request.WagonNumber);
        var number = DigitsOnlyWagon(parsedCreateNumber);
        if (number.Length != 8)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Vagon raqami 8 xonali bo‘lishi kerak"));

        if (arrival.Units.Any(u =>
                string.Equals(u.WagonNumber.Trim(), number, StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, "Bu vagon raqami shu partiyada allaqachon bor"));

        var cistern = string.IsNullOrWhiteSpace(request.CisternNumber)
            ? (parsedCreateCisterns.Count > 0 ? string.Join(", ", parsedCreateCisterns) : "")
            : request.CisternNumber.Trim();
        var conflictMsg = await FindOnSiteConflictMessageAsync(
            [number],
            FlattenCisternCodes([cistern]),
            excludeArrivalId: arrival.Id);
        if (conflictMsg is not null)
            return BadRequest(new ApiResponse<EmptyWagonArrivalDto>(false, null, conflictMsg));

        var wagonType = string.IsNullOrWhiteSpace(request.WagonType)
            ? (parsedCreateCisterns.Count > 0 ? "platform" : "sisterna")
            : (parsedCreateCisterns.Count > 0 && request.WagonType == "sisterna" ? "platform" : request.WagonType.Trim());
        var ownership = string.IsNullOrWhiteSpace(request.Ownership)
            ? WagonOwnership.Tashqi
            : WagonOwnership.Normalize(request.Ownership);
        var nextOrder = arrival.Units.Count == 0 ? 0 : arrival.Units.Max(u => u.SortOrder) + 1;
        var unit = new EmptyWagonUnit
        {
            EmptyWagonArrivalId = arrival.Id,
            SortOrder = nextOrder,
            WagonNumber = number,
            CisternNumber = cistern,
            WagonType = wagonType,
            Ownership = ownership,
            IntakeLoadState = string.IsNullOrWhiteSpace(request.IntakeLoadState)
                ? WagonIntakeLoadState.Bosh
                : WagonIntakeLoadState.Normalize(request.IntakeLoadState),
            ProductType = request.ProductType?.Trim() ?? string.Empty,
            Status = EmptyWagonUnitStatuses.AwaitingTare,
        };
        arrival.Units.Add(unit);
        db.EmptyWagonUnits.Add(unit);

        SyncArrivalProductSummary(arrival);
        if (isAdmin && !CanRailwayEditIntakeUnits(arrival.Stage))
        {
            AppendStageNotes(arrival, $"Yangi vagon {number} qo‘shildi (Admin tomonidan)", "Admin");
        }
        EmptyWagonUnitSync.SyncMirrors(arrival);
        if (!string.IsNullOrWhiteSpace(cistern))
            await CatalogParkLocationSync.UpsertContainersOnSiteAsync(db, FlattenCisternCodes([cistern]));
        await CatalogParkLocationSync.UpsertWagonsOnSiteAsync(db, [number], [unit.Ownership], [unit.WagonType]);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<EmptyWagonArrivalDto>(true, ToDto(arrival)));
    }

    /// <summary>
    /// Temir yo‘l: ICHDX xabarnomasidan oldin kiritilgan vagonni o‘chirish.
    /// Oxirgi vagon o‘chirilsa — partiya ham o‘chiriladi.
    /// </summary>
    [HttpDelete("{arrivalId:guid}/units/{unitId:guid}")]
    [Authorize(Roles = "Railway,Admin,Dispatching")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteUnit(Guid arrivalId, Guid unitId)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == arrivalId);

        if (arrival is null)
            return NotFound(new ApiResponse<object>(false, null, "Partiya topilmadi"));

        var unit = arrival.Units.FirstOrDefault(u => u.Id == unitId);
        if (unit is null)
            return NotFound(new ApiResponse<object>(false, null, "Vagon topilmadi"));

        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && !CanRailwayEditIntakeUnits(arrival.Stage))
            return BadRequest(new ApiResponse<object>(false, null,
                "Faqat qabul yoki qo‘riqlashdan qaytarilgan partiyadan vagon o‘chirish mumkin"));

        if (isAdmin && !CanRailwayEditIntakeUnits(arrival.Stage))
        {
            AppendStageNotes(arrival, $"Vagon {unit.WagonNumber} o‘chirildi (Admin tomonidan)", "Admin");
        }

        var role = User.FindFirstValue(ClaimTypes.Role) ?? "Railway";
        var fullName = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Noma'lum";
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid.TryParse(userIdStr, out var currentUserId);

        var trashItem = new RecycleBinItem
        {
            Id = Guid.NewGuid(),
            EntityType = "EmptyWagonUnit",
            EntityId = unit.Id,
            Title = $"Vagon №{unit.WagonNumber}",
            Category = "wagon",
            RelatedNumber = arrival.ArrivalNumber,
            DeletedById = currentUserId,
            DeletedByName = fullName,
            DeletedByRole = role,
            DeletedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            DeleteReason = $"Bo'sh vagon o'chirildi (Partiya: {(string.IsNullOrWhiteSpace(arrival.ArrivalNumber) ? arrival.Id.ToString()[..8] : arrival.ArrivalNumber)}, Mahsulot: {unit.ProductType})",
            PayloadJson = JsonSerializer.Serialize(unit, new JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles })
        };
        db.RecycleBinItems.Add(trashItem);

        arrival.Units.Remove(unit);
        db.EmptyWagonUnits.Remove(unit);

        if (arrival.Units.Count == 0)
        {
            var arrivalTrash = new RecycleBinItem
            {
                Id = Guid.NewGuid(),
                EntityType = "EmptyWagonArrival",
                EntityId = arrival.Id,
                Title = $"Partiya №{(string.IsNullOrWhiteSpace(arrival.ArrivalNumber) ? arrival.Id.ToString()[..8] : arrival.ArrivalNumber)} (0 vagon)",
                Category = "arrival",
                RelatedNumber = arrival.ArrivalNumber,
                DeletedById = currentUserId,
                DeletedByName = fullName,
                DeletedByRole = role,
                DeletedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddDays(30),
                DeleteReason = "Bo'sh vagon partiyasi (oxirgi vagon o'chirilgach partiya ham yakunlandi)",
                PayloadJson = JsonSerializer.Serialize(arrival, new JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles })
            };
            db.RecycleBinItems.Add(arrivalTrash);

            db.EmptyWagonArrivals.Remove(arrival);
            await db.SaveChangesAsync();
            return Ok(new ApiResponse<object>(true, new { deletedArrival = true }, "Vagon va partiya o‘chirildi (Korzinada saqlandi)"));
        }

        // SortOrder qayta tartiblash
        var ordered = arrival.Units.OrderBy(u => u.SortOrder).ThenBy(u => u.WagonNumber).ToList();
        for (var i = 0; i < ordered.Count; i++)
            ordered[i].SortOrder = i;

        EmptyWagonUnitSync.SyncMirrors(arrival);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { deletedArrival = false, arrival = ToDto(arrival) }, "Vagon o‘chirildi (Korzinada saqlandi)"));
    }

    /// <summary>
    /// Temir yo‘l vagon kiritish: ICHDX oldidan yoki qo‘riqlashdan qaytganda tahrirlash.
    /// </summary>
    private static bool CanRailwayEditIntakeUnits(string? stage) =>
        string.Equals(stage, "RailwayInspected", StringComparison.OrdinalIgnoreCase)
        || string.Equals(stage, "KengsoyInspection", StringComparison.OrdinalIgnoreCase);

    private static string DigitsOnlyWagon(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        return new string(value.Where(char.IsDigit).ToArray());
    }

    private static void AppendStageNotes(EmptyWagonArrival arrival, string? notes, string? prefix)
    {
        var text = (notes ?? "").Trim();
        if (text.Length == 0) return;
        var stamp = DateTime.UtcNow.ToString("dd.MM.yyyy HH:mm");
        var line = string.IsNullOrWhiteSpace(prefix)
            ? $"[{stamp}] {text}"
            : $"[{stamp} · {prefix}] {text}";
        arrival.Notes = string.IsNullOrWhiteSpace(arrival.Notes)
            ? line
            : $"{arrival.Notes.Trim()}\n{line}";
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Railway,Dispatching,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null)
            return NotFound(new ApiResponse<object>(false, null, "Keltirilgan bo'sh vagon topilmadi"));

        var role = User.FindFirstValue(ClaimTypes.Role) ?? "Dispatching";
        var fullName = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Noma'lum";
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid.TryParse(userIdStr, out var currentUserId);

        var trashItem = new RecycleBinItem
        {
            Id = Guid.NewGuid(),
            EntityType = "EmptyWagonArrival",
            EntityId = arrival.Id,
            Title = $"Partiya №{(string.IsNullOrWhiteSpace(arrival.ArrivalNumber) ? arrival.Id.ToString()[..8] : arrival.ArrivalNumber)} ({arrival.WagonCount} vagon)",
            Category = "arrival",
            RelatedNumber = arrival.ArrivalNumber,
            DeletedById = currentUserId,
            DeletedByName = fullName,
            DeletedByRole = role,
            DeletedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            DeleteReason = $"Bo'sh vagon partiyasi o'chirildi (Mahsulot: {arrival.ProductType})",
            PayloadJson = JsonSerializer.Serialize(arrival, new JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles })
        };
        db.RecycleBinItems.Add(trashItem);

        db.EmptyWagonArrivals.Remove(arrival);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, true, "Partiya o‘chirildi va Korzinaga yuborildi"));
    }

    private static void SyncArrivalProductSummary(EmptyWagonArrival arrival)
    {
        var products = (arrival.Units ?? [])
            .Select(u => u.ProductType?.Trim() ?? string.Empty)
            .Where(p => p.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        arrival.ProductType = products.Count switch
        {
            0 => string.Empty,
            1 => products[0],
            _ => string.Join(", ", products),
        };
    }

    private static List<string> SplitCsv(string? value) =>
        (value ?? "")
            .Split(',')
            .Select(d => d.Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

    private static List<string> ParseWagonNumbers(string? value) =>
        (value ?? "")
            .Split([',', ';', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

    /// <summary>
    /// Vagon bo‘yicha sisterna/konteyner slotlari. Vergul — vagonlar oralig‘i;
    /// bitta vagon ichida bir nechta konteyner «|» yoki «/» bilan emas, « · » yoki «;» bilan.
    /// Oddiy holat: har bir slot bitta vagon uchun (ichida « | » bo‘lishi mumkin).
    /// </summary>
    private static List<string> ParseCisternSlots(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];
        // Preserve per-wagon slots separated by comma; trim each
        return value
            .Split(',', StringSplitOptions.None)
            .Select(x => x.Trim())
            .ToList();
    }

    private static List<string> PadList(List<string> source, int count, string fill = "")
    {
        var list = source.Take(count).ToList();
        while (list.Count < count) list.Add(fill);
        return list;
    }

    /// <summary>
    /// Zavod hududidagi (chiqib ketmagan) partiyalar — vagon va sisterna/konteyner raqamlari band.
    /// Exited / Cancelled dan keyin qayta kiritish mumkin.
    /// </summary>
    private static readonly string[] OccupiedOnSiteStages =
    [
        "RailwayInspected",
        "KengsoyInspection",
        "SecurityInspection",
        "ReadyForEstakada",
        "TareWeighing",
        "EstakadaPlaced",
        "Loading",
        "Loaded",
        "ToRailwayScale",
        "GrossWeighed",
        "SealInstallation",
        "Sealed",
        "RegistryPrepared",
        "DocumentsIssued",
    ];

    private static List<string> FlattenCisternCodes(IEnumerable<string?> slots)
    {
        var list = new List<string>();
        foreach (var slot in slots)
        {
            if (string.IsNullOrWhiteSpace(slot)) continue;
            foreach (var part in slot.Split(['|', ';', '·', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries))
            {
                var code = NormalizeCode(part);
                if (code.Length > 0) list.Add(code);
            }
        }
        return list;
    }

    private static string NormalizeCode(string? value) =>
        (value ?? "").Trim().ToLowerInvariant();

    private async Task<string?> FindOnSiteConflictMessageAsync(
        IReadOnlyList<string> intakeNumbers,
        IReadOnlyList<string> intakeCisterns,
        Guid? excludeArrivalId)
    {
        var query = db.EmptyWagonArrivals
            .AsNoTracking()
            .Include(a => a.Units)
            .Where(a => OccupiedOnSiteStages.Contains(a.Stage));

        if (excludeArrivalId is not null)
            query = query.Where(a => a.Id != excludeArrivalId.Value);

        var candidates = await query.ToListAsync();

        // Yuklash reyestri orqali Kengsoyga (zavoddan tashqariga) chiqib ketgan vagonlar
        var departedRegistryWagons = await db.LoadingRegistries
            .AsNoTracking()
            .Where(r => r.ExitedToKengsoyAt != null && !string.IsNullOrEmpty(r.WagonRoutesJson))
            .Select(r => r.WagonRoutesJson!)
            .ToListAsync();

        var departedWagonNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rJson in departedRegistryWagons)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(rJson);
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var elem in doc.RootElement.EnumerateArray())
                    {
                        var isDef = elem.TryGetProperty("IsDefective", out var pDef) && pDef.GetBoolean();
                        if (!isDef && elem.TryGetProperty("WagonNumber", out var pNum))
                        {
                            var num = pNum.GetString()?.Trim();
                            if (!string.IsNullOrEmpty(num)) departedWagonNumbers.Add(num);
                        }
                    }
                }
            }
            catch { }
        }

        var occupiedWagons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var occupiedCisterns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in candidates)
        {
            if (row.Units != null && row.Units.Count > 0)
            {
                foreach (var unit in row.Units)
                {
                    // Zavoddan chiqib ketgan (ScaleExitedAt), qaytarilgan yoki reyestrda Kengsoyga ketgan vagonlar band hisoblanmaydi
                    if (unit.ScaleExitedAt.HasValue || unit.Status == EmptyWagonUnitStatuses.Returned)
                        continue;

                    if (!string.IsNullOrWhiteSpace(unit.WagonNumber))
                    {
                        var wNum = unit.WagonNumber.Trim();
                        if (departedWagonNumbers.Contains(wNum))
                            continue;

                        occupiedWagons.Add(wNum);
                    }

                    foreach (var code in FlattenCisternCodes([unit.CisternNumber]))
                        occupiedCisterns.Add(code);
                }
            }
            else
            {
                var source = string.IsNullOrWhiteSpace(row.VerifiedWagonNumbers)
                    ? row.WagonNumbers
                    : row.VerifiedWagonNumbers;
                foreach (var n in ParseWagonNumbers(source))
                {
                    if (!departedWagonNumbers.Contains(n))
                        occupiedWagons.Add(n);
                }

                foreach (var code in FlattenCisternCodes(ParseCisternSlots(row.CisternNumbers)))
                    occupiedCisterns.Add(code);
            }
        }

        var wagonConflicts = intakeNumbers
            .Select(n => n.Trim())
            .Where(n => n.Length > 0 && occupiedWagons.Contains(n))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (wagonConflicts.Count == 1)
            return $"Bu vagon raqami zavod hududida: {wagonConflicts[0]}. Chiqib ketmaguncha qayta kiritib bo‘lmaydi.";
        if (wagonConflicts.Count > 1)
            return $"Bu vagon raqamlari zavod hududida: {string.Join(", ", wagonConflicts)}. Chiqib ketmaguncha qayta kiritib bo‘lmaydi.";

        var cisternConflicts = intakeCisterns
            .Select(NormalizeCode)
            .Where(n => n.Length > 0 && occupiedCisterns.Contains(n))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (cisternConflicts.Count == 1)
            return $"Bu sisterna/konteyner raqami zavod hududida: {cisternConflicts[0]}. Chiqib ketmaguncha qayta kiritib bo‘lmaydi.";
        if (cisternConflicts.Count > 1)
            return $"Bu sisterna/konteyner raqamlari zavod hududida: {string.Join(", ", cisternConflicts)}. Chiqib ketmaguncha qayta kiritib bo‘lmaydi.";

        return null;
    }

    private static EmptyWagonArrivalDto ToDto(EmptyWagonArrival a)
    {
        var depts = SplitCsv(a.NotifiedDepartments);
        var prepared = SplitCsv(a.PreparedDepartments);
        var wagons = (a.Units ?? [])
            .OrderBy(u => u.SortOrder)
            .ThenBy(u => u.WagonNumber)
            .Select(EmptyWagonUnitSync.ToUnitDto)
            .ToList();

        return new EmptyWagonArrivalDto(
            a.Id,
            a.ArrivalNumber,
            a.ArrivalDate,
            a.WagonCount,
            a.WagonNumbers,
            a.CisternNumbers,
            a.ProductType,
            a.TrackNumber,
            depts,
            prepared,
            string.IsNullOrEmpty(a.Stage) ? "KengsoyInspection" : a.Stage,
            a.TareWeight ?? string.Empty,
            a.VerifiedWagonNumbers ?? string.Empty,
            a.Notes,
            a.CreatedBy?.FullName ?? "ICH DX Dispetcheri",
            a.CreatedAt,
            a.LoadingComment ?? string.Empty,
            a.LoadingCompletedByName ?? string.Empty,
            a.LoadingCompletedAt,
            a.EconomistNotifiedAt,
            a.GrossWeight ?? string.Empty,
            wagons,
            a.EntryPermitNumber ?? string.Empty,
            a.EntryPermitShiftApprovedAt,
            a.EntryPermitShiftApprovedByName ?? string.Empty,
            a.EntryPermitPermitApprovedAt,
            a.EntryPermitPermitApprovedByName ?? string.Empty,
            a.EntryPermitSecurityApprovedAt,
            a.EntryPermitSecurityApprovedByName ?? string.Empty,
            a.EntryPermitQrGlobalId ?? string.Empty,
            a.EntryPermitQrVerificationUrl ?? string.Empty,
            a.EntryPermitQrCodeBase64 ?? string.Empty,
            a.EntryPermitQrRegisteredAt
        );
    }

    [HttpGet("{arrivalId:guid}/entry-permit/pdf")]
    [AllowAnonymous]
    public async Task<IActionResult> GetEntryPermitPdf(Guid arrivalId)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == arrivalId);
        if (arrival is null) return NotFound("Partiya topilmadi");

        var permitNo = string.IsNullOrWhiteSpace(arrival.EntryPermitNumber) ? arrival.ArrivalNumber : arrival.EntryPermitNumber;
        var wagonRows = (arrival.Units ?? []).Select((u, i) => new EntryPermitPdfWagonRow(
            Index: i + 1,
            WagonNumber: u.WagonNumber,
            CisternNumber: u.CisternNumber,
            WagonType: !string.IsNullOrWhiteSpace(u.WagonType) ? u.WagonType : "Vagon-sisterna",
            ProductType: !string.IsNullOrWhiteSpace(u.ProductType) ? u.ProductType : (!string.IsNullOrWhiteSpace(arrival.ProductType) ? arrival.ProductType : string.Empty),
            Status: u.Status
        )).ToList();

        var isDone = arrival.EntryPermitShiftApprovedAt != null
            && arrival.EntryPermitPermitApprovedAt != null
            && arrival.EntryPermitSecurityApprovedAt != null;

        var approvedAt = arrival.EntryPermitSecurityApprovedAt
            ?? arrival.EntryPermitPermitApprovedAt
            ?? arrival.EntryPermitShiftApprovedAt
            ?? arrival.CreatedAt;

        var pdfBytes = pdfGenerator.GenerateEntryPermitPdf(new EntryPermitPdfModel(
            PermitNumber: permitNo,
            ArrivalNumber: arrival.ArrivalNumber,
            ProductType: arrival.ProductType,
            WagonCount: arrival.WagonCount,
            CreatedAt: arrival.CreatedAt,
            CreatedByName: arrival.CreatedBy?.FullName ?? "Dispetcher",
            QrVerificationUrl: arrival.EntryPermitQrVerificationUrl,
            QrGlobalId: arrival.EntryPermitQrGlobalId,
            Wagons: wagonRows,
            ShiftLeaderName: arrival.EntryPermitShiftApprovedByName,
            ShiftLeaderAt: arrival.EntryPermitShiftApprovedAt,
            ShiftLeaderApproved: arrival.EntryPermitShiftApprovedAt != null,
            PermitOfficerName: arrival.EntryPermitPermitApprovedByName,
            PermitOfficerAt: arrival.EntryPermitPermitApprovedAt,
            SecurityOfficerName: arrival.EntryPermitSecurityApprovedByName,
            SecurityOfficerAt: arrival.EntryPermitSecurityApprovedAt,
            ApprovedAt: approvedAt,
            IsDone: isDone
        ));

        return File(pdfBytes, "application/pdf", $"Ruxsatnoma_{permitNo}.pdf");
    }
}
