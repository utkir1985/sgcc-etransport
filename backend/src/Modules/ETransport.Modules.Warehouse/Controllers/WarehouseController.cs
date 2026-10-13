using ETransport.Infrastructure.Identity;
using ETransport.Infrastructure.Notifications;
using System.Security.Claims;
using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Core.Interfaces;
using ETransport.Infrastructure.Audit;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Warehouse.Controllers;

public static class WarehouseLoadingStages
{
    public const string EstakadaPlaced = "EstakadaPlaced";
    public const string Loading = "Loading";
    public const string Loaded = "Loaded";
    public const string ToRailwayScale = "ToRailwayScale";
    public const string GrossWeighed = "GrossWeighed";
    public const string SealInstallation = "SealInstallation";
    public const string Sealed = "Sealed";
}

public interface IWarehouseLoadingService
{
    Task<List<LoadingTaskDto>> GetLoadingQueueAsync();
    Task<List<LoadingTaskDto>> GetEconomistNotificationsAsync();
    Task<LoadingTaskDto?> StartLoadingAsync(Guid id, Guid userId, LoadingStartRequest? request);
    Task<LoadingTaskDto?> CompleteLoadingAsync(Guid id, Guid userId, LoadingCompleteRequest request);
    Task<LoadingTaskDto?> StartWagonLoadingAsync(Guid id, string wagonNumber, Guid userId, LoadingStartRequest? request);
    Task<LoadingTaskDto?> CompleteWagonLoadingAsync(Guid id, string wagonNumber, Guid userId, LoadingCompleteRequest request);
    Task<LoadingTaskDto?> ReturnWagonLoadingAsync(Guid id, string wagonNumber, Guid userId, LoadingReturnRequest request);
    Task<LoadingTaskDto?> RollbackWagonLoadingAsync(Guid id, string wagonNumber, Guid userId, LoadingRollbackRequest request);
    Task<LoadingTaskDto?> EditWagonLoadingAsync(Guid id, string wagonNumber, Guid userId, LoadingWagonEditRequest request);
    Task<LoadingTaskDto?> SendWagonToScaleAsync(Guid id, string wagonNumber, Guid userId, string? comment = null);
    Task<LoadingTaskDto> AddInternalWagonsAsync(Guid userId, AddInternalWagonsRequest request);
}

public class WarehouseLoadingService(AppDbContext db, IAuditService auditService) : IWarehouseLoadingService
{
    private static readonly string[] QueueStages =
    [
        WarehouseLoadingStages.EstakadaPlaced,
        WarehouseLoadingStages.Loading,
        WarehouseLoadingStages.Loaded,
        WarehouseLoadingStages.ToRailwayScale,
        WarehouseLoadingStages.GrossWeighed,
        WarehouseLoadingStages.SealInstallation,
        WarehouseLoadingStages.Sealed,
        "RegistryPrepared",
    ];

    private static readonly string[] EconomistStages =
    [
        // Plomba (Scale + Qo‘riqlash) tugagandan keyin yuk xati
        WarehouseLoadingStages.Sealed,
    ];

    public async Task<List<LoadingTaskDto>> GetLoadingQueueAsync()
    {
        var items = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.DailyPlan)
            .Include(a => a.Units)
            .Where(a => a.Stage != "Cancelled" && (a.Stage != "Exited" || a.Units.Any(u => u.ScaleExitedAt == null)))
            .Where(a => a.Units.Count == 0
                || a.Units.Any(u => u.ScaleExitedAt == null && (
                    u.Status == EmptyWagonUnitStatuses.AwaitingTare
                    || u.Status == EmptyWagonUnitStatuses.Estakada
                    || u.Status == EmptyWagonUnitStatuses.Loading
                    || u.Status == EmptyWagonUnitStatuses.ToRailwayScale
                    || u.Status == EmptyWagonUnitStatuses.Loaded
                    || u.Status == EmptyWagonUnitStatuses.GrossWeighed
                    // Yuklangan vagon plomba tugagach ham hududda qoladi (keyingi yuk xatigacha) —
                    // yuklash sahifasida «Yuklangan» / «Chiqishga tayyor» holatida ko‘rinadi.
                    || u.Status == EmptyWagonUnitStatuses.SealPending
                    || u.Status == EmptyWagonUnitStatuses.Sealed
                    || u.Status == EmptyWagonUnitStatuses.Returned))
                || QueueStages.Contains(a.Stage)
                || a.Stage == "ReadyForEstakada"
                || a.Stage == "TareWeighing")
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        foreach (var arrival in items.Where(a => a.Units.Count == 0))
            await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        foreach (var arrival in items)
        {
            EmptyWagonUnitSync.PromoteToEstakadaWhenTareComplete(arrival);
            EmptyWagonUnitSync.DerivePartyStage(arrival);
        }
        await db.SaveChangesAsync();

        return items
            .Where(a => a.Units.Any(u => u.ScaleExitedAt == null))
            .Select(ToDto)
            .Where(dto => dto.Wagons.Count > 0)
            .ToList();
    }

    public async Task<List<LoadingTaskDto>> GetEconomistNotificationsAsync()
    {
        var items = await db.EmptyWagonArrivals
            .AsNoTracking()
            .Include(a => a.CreatedBy)
            .Include(a => a.DailyPlan)
            .Include(a => a.Units)
            .Where(a => EconomistStages.Contains(a.Stage)
                || a.Units.Any(u => u.Status == EmptyWagonUnitStatuses.Sealed
                    || (u.Status == EmptyWagonUnitStatuses.Returned && u.DefectActUploadedAt != null)))
            .OrderByDescending(a => a.EconomistNotifiedAt ?? a.CreatedAt)
            .ToListAsync();

        return items.Select(ToDto).ToList();
    }

    public async Task<LoadingTaskDto?> StartLoadingAsync(Guid id, Guid userId, LoadingStartRequest? request)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var ready = arrival.Units
            .Where(u => u.Status is EmptyWagonUnitStatuses.Estakada
                     or EmptyWagonUnitStatuses.AwaitingTare
                     or EmptyWagonUnitStatuses.Tared)
            .ToList();
        if (ready.Count == 0)
            throw new InvalidOperationException("Estakadada yuklashga tayyor vagon yo‘q.");

        foreach (var u in ready)
        {
            u.Status = EmptyWagonUnitStatuses.Loading;
            u.LoadingStartedAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(request?.Comment))
                u.LoadingComment = request.Comment.Trim();
        }

        MarkPrepared(arrival);
        arrival.DailyPlanLineId = null;
        await TryAttachPlanByProductAsync(arrival);
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "ProductLoadingStarted",
            entityType: nameof(EmptyWagonArrival),
            entityId: arrival.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                arrivalNumber = arrival.ArrivalNumber,
                wagonCount = ready.Count,
                wagonNumbers = ready.Select(u => u.WagonNumber).ToList(),
                productType = arrival.ProductType,
                comment = request?.Comment
            }),
            category: "Warehouse"
        );

        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto?> StartWagonLoadingAsync(
        Guid id, string wagonNumber, Guid userId, LoadingStartRequest? request)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber)
            ?? throw new InvalidOperationException("Vagon topilmadi.");

        if (unit.Status is not (EmptyWagonUnitStatuses.Estakada or EmptyWagonUnitStatuses.Loading or EmptyWagonUnitStatuses.AwaitingTare or EmptyWagonUnitStatuses.Tared))
            throw new InvalidOperationException("Faqat estakadadagi vagon yuklashga olinadi.");

        unit.Status = EmptyWagonUnitStatuses.Loading;
        unit.LoadingStartedAt ??= DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(request?.Comment))
            unit.LoadingComment = request.Comment.Trim();

        MarkPrepared(arrival);
        arrival.DailyPlanLineId = null;
        await TryAttachPlanByProductAsync(arrival);
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "ProductLoadingStarted",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                productType = unit.ProductType,
                comment = request?.Comment,
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Warehouse"
        );

        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto?> CompleteLoadingAsync(Guid id, Guid userId, LoadingCompleteRequest request)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var loading = arrival.Units.Where(u => u.Status is EmptyWagonUnitStatuses.Loading
            or EmptyWagonUnitStatuses.Estakada
            or EmptyWagonUnitStatuses.AwaitingTare
            or EmptyWagonUnitStatuses.Tared).ToList();
        if (loading.Count == 0)
            throw new InvalidOperationException("Yuklanayotgan vagon yo‘q.");

        var user = await db.Users.FindAsync(userId);
        foreach (var u in loading)
        {
            u.LoadingStartedAt ??= DateTime.UtcNow;
            CompleteUnit(u, request.Comment, user?.FullName);
        }

        MarkEconomist(arrival, user?.FullName);
        arrival.DailyPlanLineId = null;
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "ProductLoaded",
            entityType: nameof(EmptyWagonArrival),
            entityId: arrival.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                arrivalNumber = arrival.ArrivalNumber,
                wagonCount = loading.Count,
                wagonNumbers = loading.Select(u => u.WagonNumber).ToList(),
                productType = arrival.ProductType,
                comment = request.Comment
            }),
            category: "Warehouse"
        );

        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto?> CompleteWagonLoadingAsync(
        Guid id, string wagonNumber, Guid userId, LoadingCompleteRequest request)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber)
            ?? throw new InvalidOperationException("Vagon topilmadi.");

        if (unit.Status is not (EmptyWagonUnitStatuses.Estakada or EmptyWagonUnitStatuses.Loading or EmptyWagonUnitStatuses.AwaitingTare or EmptyWagonUnitStatuses.Tared))
            throw new InvalidOperationException("Bu vagon yuklashga tayyor emas yoki allaqachon yuklangan.");

        // Tara erta majburiy emas — UNG chiqishda beradi

        var user = await db.Users.FindAsync(userId);
        if (unit.Status != EmptyWagonUnitStatuses.Loading)
        {
            unit.Status = EmptyWagonUnitStatuses.Loading;
            unit.LoadingStartedAt ??= DateTime.UtcNow;
        }

        CompleteUnit(unit, request.Comment, user?.FullName);
        MarkEconomist(arrival, user?.FullName);
        arrival.DailyPlanLineId = null;
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "ProductLoaded",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                productType = unit.ProductType,
                comment = request.Comment,
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Warehouse"
        );

        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto?> ReturnWagonLoadingAsync(
        Guid id, string wagonNumber, Guid userId, LoadingReturnRequest request)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 3)
            throw new InvalidOperationException("Nuqson yoki kamchilik sababini yozing (kamida 3 belgi).");

        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber)
            ?? throw new InvalidOperationException("Vagon topilmadi.");

        if (unit.Status is not (EmptyWagonUnitStatuses.Estakada or EmptyWagonUnitStatuses.Loading or EmptyWagonUnitStatuses.Loaded or EmptyWagonUnitStatuses.AwaitingTare or EmptyWagonUnitStatuses.Tared))
            throw new InvalidOperationException("Faqat estakada, yuklanayotgan yoki yuklangan vagonga nuqson qo‘yiladi.");

        var user = await db.Users.FindAsync(userId);
        unit.Status = EmptyWagonUnitStatuses.Returned;
        unit.LoadingComment = reason;
        unit.LoadingCompletedAt = null;
        AppendArrivalNotes(arrival, reason, $"Yuklash kamchilik · {unit.WagonNumber}");
        _ = userId;
        _ = user;

        arrival.DailyPlanLineId = null;
        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "WagonReturned",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                reason,
                stage = "Loading",
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Operations",
            status: "Warning"
        );

        return ToDto(arrival);
    }


    public async Task<LoadingTaskDto?> RollbackWagonLoadingAsync(
        Guid id, string wagonNumber, Guid userId, LoadingRollbackRequest request)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 3)
            throw new InvalidOperationException("Rollback sababini yozing (kamida 3 belgi).");

        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber)
            ?? throw new InvalidOperationException("Vagon topilmadi.");

        unit.Status = EmptyWagonUnitStatuses.Returned;
        unit.LoadingComment = reason;
        unit.LoadingCompletedAt = null;
        AppendArrivalNotes(arrival, reason, $"Rollback · {unit.WagonNumber}");

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "WagonRolledBack",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: System.Text.Json.JsonSerializer.Serialize(new
            {
                wagonNumber = unit.WagonNumber,
                reason,
                arrivalNumber = arrival.ArrivalNumber
            }),
            category: "Operations",
            status: "Warning"
        );

        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto?> SendWagonToScaleAsync(Guid id, string wagonNumber, Guid userId, string? comment = null)
    {
        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber)
            ?? throw new InvalidOperationException("Vagon topilmadi.");

        if (unit.Status != EmptyWagonUnitStatuses.Loaded)
            throw new InvalidOperationException("Faqat yuklangan vagonni taroziga jo‘natish mumkin.");

        unit.Status = EmptyWagonUnitStatuses.ToRailwayScale;
        if (!string.IsNullOrWhiteSpace(comment))
            unit.LoadingComment = comment.Trim();

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "SentToRailwayScale",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new
            {
                arrivalNumber = arrival.ArrivalNumber,
                wagonNumber = unit.WagonNumber,
                comment
            }),
            category: "Warehouse"
        );

        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto?> EditWagonLoadingAsync(
        Guid id, string wagonNumber, Guid userId, LoadingWagonEditRequest request)
    {
        var editComment = (request.EditComment ?? "").Trim();
        if (editComment.Length < 3)
            throw new InvalidOperationException("Tahrirlash izohini yozing (kamida 3 belgi).");

        var arrival = await LoadArrivalAsync(id);
        if (arrival is null) return null;

        var unit = EmptyWagonUnitSync.FindUnit(arrival, wagonNumber)
            ?? throw new InvalidOperationException("Vagon topilmadi.");

        var editableStatuses = new[]
        {
            EmptyWagonUnitStatuses.AwaitingTare,
            EmptyWagonUnitStatuses.Tared,
            EmptyWagonUnitStatuses.Estakada,
            EmptyWagonUnitStatuses.Loading,
            EmptyWagonUnitStatuses.Loaded,
            EmptyWagonUnitStatuses.GrossWeighed,
            EmptyWagonUnitStatuses.Returned,
        };
        if (!editableStatuses.Contains(unit.Status))
            throw new InvalidOperationException("Bu holatdagi vagonni tahrirlab bo‘lmaydi.");

        if (!string.IsNullOrWhiteSpace(unit.SealNumber))
            throw new InvalidOperationException("Plomba o‘rnatilgan vagonni tahrirlab bo‘lmaydi.");

        var changes = new List<string>();

        void Track(string label, string oldValue, string? newValue, Action apply)
        {
            if (newValue is null) return;
            var next = newValue.Trim();
            var prev = oldValue.Trim();
            if (next == prev) return;
            changes.Add($"{label}: {(string.IsNullOrWhiteSpace(prev) ? "—" : prev)} → {(string.IsNullOrWhiteSpace(next) ? "—" : next)}");
            apply();
        }

        Track("Mahsulot", unit.ProductType, request.ProductType, () => unit.ProductType = request.ProductType!.Trim());
        Track("Yuklash izohi", unit.LoadingComment, request.LoadingComment, () => unit.LoadingComment = request.LoadingComment!.Trim());
        Track("Yuklash guruhi", unit.LoadingBatchNumber, request.LoadingBatchNumber, () => unit.LoadingBatchNumber = request.LoadingBatchNumber!.Trim());
        Track("Tara", unit.TareWeight, request.TareWeight, () => unit.TareWeight = request.TareWeight!.Trim());
        Track("Brutto", unit.GrossWeight, request.GrossWeight, () => unit.GrossWeight = request.GrossWeight!.Trim());

        if (changes.Count == 0)
            throw new InvalidOperationException("Hech qanday o‘zgarish kiritilmadi.");

        await auditService.LogAsync(
            userId: userId,
            action: "LoadingWagonEdited",
            entityType: nameof(EmptyWagonUnit),
            entityId: unit.Id.ToString(),
            details: JsonSerializer.Serialize(new { comment = editComment, changes, wagonNumber = unit.WagonNumber, arrivalNumber = arrival.ArrivalNumber }),
            category: "Warehouse"
        );

        EmptyWagonUnitSync.SyncMirrors(arrival);
        EmptyWagonUnitSync.DerivePartyStage(arrival);
        await db.SaveChangesAsync();
        return ToDto(arrival);
    }

    public async Task<LoadingTaskDto> AddInternalWagonsAsync(Guid userId, AddInternalWagonsRequest request)
    {
        var rawNumbers = (request.WagonNumbers ?? "")
            .Split(new[] { ',', '\n', '\r', ' ', '\t', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (rawNumbers.Count == 0)
            throw new InvalidOperationException("Kamida bitta vagon raqamini kiriting.");

        var product = (request.ProductType ?? "").Trim();
        if (string.IsNullOrWhiteSpace(product))
            throw new InvalidOperationException("Mahsulot turini tanlang.");

        var user = await db.Users.FindAsync(userId);

        var now = DateTime.UtcNow;
        var period = $"{now:MM}{now:yy}";
        var prefix = $"ZF-{period}-";
        var existing = await db.EmptyWagonArrivals.AsNoTracking()
            .Where(a => a.ArrivalNumber.StartsWith(prefix))
            .Select(a => a.ArrivalNumber)
            .ToListAsync();
        var maxSeq = existing
            .Select(num => int.TryParse(num.Replace(prefix, ""), out var s) ? s : 0)
            .DefaultIfEmpty(0)
            .Max();
        var arrivalNumber = $"{prefix}{(maxSeq + 1):D3}";

        var defaultWagonType = !string.IsNullOrWhiteSpace(request.WagonType)
            ? request.WagonType.Trim()
            : (product.Contains("gaz", StringComparison.OrdinalIgnoreCase) ? "sisterna" : "yopiq");

        var loadStates = EmptyWagonUnitSync.ParseIntakeLoadStates(request.IntakeLoadStates);
        while (loadStates.Count < rawNumbers.Count)
            loadStates.Add(WagonIntakeLoadState.Bosh);

        var allLoaded = rawNumbers.Count > 0 && loadStates.Take(rawNumbers.Count).All(s => s == WagonIntakeLoadState.Yukli);

        var arrival = new EmptyWagonArrival
        {
            Id = Guid.NewGuid(),
            ArrivalNumber = arrivalNumber,
            ArrivalDate = now,
            WagonCount = rawNumbers.Count,
            WagonNumbers = string.Join(", ", rawNumbers),
            ProductType = product,
            Stage = allLoaded ? WarehouseLoadingStages.Loaded : WarehouseLoadingStages.EstakadaPlaced,
            CreatedById = userId,
            CreatedAt = now,
            Notes = $"[Zavod ichki fondi] {(request.Comment ?? "Zavod hududidagi zaxira vagonlar").Trim()}",
            PreparedDepartments = "TM va XA smena muxandisi",
            EntryPermitShiftApprovedAt = now,
            EntryPermitShiftApprovedByName = user?.FullName ?? "TM va XA smena muxandisi",
            TareWeight = request.TareWeight?.Trim() ?? "",
        };

        db.EmptyWagonArrivals.Add(arrival);

        for (int i = 0; i < rawNumbers.Count; i++)
        {
            var state = i < loadStates.Count ? loadStates[i] : WagonIntakeLoadState.Bosh;
            var isLoaded = state == WagonIntakeLoadState.Yukli;

            var unit = new EmptyWagonUnit
            {
                Id = Guid.NewGuid(),
                EmptyWagonArrivalId = arrival.Id,
                WagonNumber = rawNumbers[i],
                SortOrder = i,
                Status = isLoaded ? EmptyWagonUnitStatuses.Loaded : EmptyWagonUnitStatuses.Estakada,
                IntakeLoadState = state,
                ProductType = product,
                WagonType = defaultWagonType,
                Ownership = "majmua",
                TareWeight = request.TareWeight?.Trim() ?? "",
                LoadingCompletedAt = isLoaded ? now : null,
                LoadingCompletedByName = isLoaded ? (user?.FullName ?? "TM va XA smena muxandisi") : string.Empty,
            };
            arrival.Units.Add(unit);
            db.EmptyWagonUnits.Add(unit);
        }

        await db.SaveChangesAsync();

        return ToDto(arrival);
    }

    private async Task<EmptyWagonArrival?> LoadArrivalAsync(Guid id)
    {
        var arrival = await db.EmptyWagonArrivals
            .Include(a => a.CreatedBy)
            .Include(a => a.DailyPlan)
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (arrival is null) return null;
        await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        return arrival;
    }

    private static void CompleteUnit(EmptyWagonUnit unit, string? comment, string? userName)
    {
        unit.Status = EmptyWagonUnitStatuses.Loaded;
        unit.LoadingCompletedAt = DateTime.UtcNow;
        unit.LoadingCompletedByName = userName?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(comment))
            unit.LoadingComment = comment.Trim();
    }

    private static void AppendArrivalNotes(EmptyWagonArrival arrival, string notes, string prefix)
    {
        var text = notes.Trim();
        if (text.Length == 0) return;
        var stamp = DateTime.UtcNow.ToString("dd.MM.yyyy HH:mm");
        var line = $"[{stamp} · {prefix}] {text}";
        arrival.Notes = string.IsNullOrWhiteSpace(arrival.Notes)
            ? line
            : $"{arrival.Notes.Trim()}\n{line}";
    }

    private static void MarkPrepared(EmptyWagonArrival arrival)
    {
        var prepared = SplitList(arrival.PreparedDepartments);
        if (!prepared.Contains("TM va XA smena muxandisi", StringComparer.OrdinalIgnoreCase))
        {
            prepared.Add("TM va XA smena muxandisi");
            arrival.PreparedDepartments = string.Join(", ", prepared);
        }
    }

    private static void MarkEconomist(EmptyWagonArrival arrival, string? userName)
    {
        if (arrival.Units.Any(u => u.Status is EmptyWagonUnitStatuses.Loaded or EmptyWagonUnitStatuses.GrossWeighed))
        {
            arrival.EconomistNotifiedAt ??= DateTime.UtcNow;
            arrival.LoadingCompletedAt = DateTime.UtcNow;
            arrival.LoadingCompletedByName = userName ?? "TM va XA";
        }

        var prepared = SplitList(arrival.PreparedDepartments);
        if (!prepared.Contains("TM va XA smena muxandisi", StringComparer.OrdinalIgnoreCase))
            prepared.Add("TM va XA smena muxandisi");
        if (!prepared.Contains("ICHDX Iqtisodchilari", StringComparer.OrdinalIgnoreCase))
            prepared.Add("ICHDX Iqtisodchilari");
        arrival.PreparedDepartments = string.Join(", ", prepared);

        var notified = SplitList(arrival.NotifiedDepartments);
        if (!notified.Contains("ICHDX Iqtisodchilari", StringComparer.OrdinalIgnoreCase))
        {
            notified.Add("ICHDX Iqtisodchilari");
            arrival.NotifiedDepartments = string.Join(", ", notified);
        }
    }

    private async Task TryAttachPlanByProductAsync(EmptyWagonArrival arrival)
    {
        if (arrival.DailyPlanId is not null) return;
        if (string.IsNullOrWhiteSpace(arrival.ProductType)) return;

        var product = arrival.ProductType.Trim().ToLower();
        var plan = await db.DailyPlans
            .AsNoTracking()
            .Include(p => p.MonthlyOrder)
            .Where(p => p.Status != PlanStatus.Rejected
                && p.MonthlyOrder != null
                && p.MonthlyOrder.ProductType.ToLower() == product)
            .OrderByDescending(p => p.PlanDate)
            .ThenByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();

        if (plan is null) return;
        arrival.DailyPlanId = plan.Id;
    }

    private static List<string> SplitList(string? value) =>
        (value ?? "")
            .Split(',')
            .Select(d => d.Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

    private static LoadingTaskDto ToDto(EmptyWagonArrival a)
    {
        var wagons = (a.Units ?? [])
            .Where(u => u.ScaleExitedAt == null)
            .OrderBy(u => u.SortOrder)
            .ThenBy(u => u.WagonNumber)
            .Select(EmptyWagonUnitSync.ToUnitDto)
            .ToList();

        return new(
            a.Id,
            a.ArrivalNumber,
            a.ArrivalDate,
            wagons.Count > 0 ? wagons.Count : a.WagonCount,
            string.IsNullOrWhiteSpace(a.VerifiedWagonNumbers) ? a.WagonNumbers : a.VerifiedWagonNumbers,
            a.CisternNumbers,
            a.ProductType,
            a.TrackNumber,
            a.Stage,
            a.TareWeight ?? "",
            a.LoadingComment ?? "",
            a.LoadingCompletedByName ?? "",
            a.LoadingCompletedAt,
            a.EconomistNotifiedAt,
            a.CreatedBy?.FullName ?? "",
            a.CreatedAt,
            a.GrossWeight ?? "",
            a.DailyPlanId,
            a.DailyPlan?.PlanNumber ?? "",
            wagons);
    }
}

[ApiController]
[Route("api/warehouse")]
[Authorize]
public class WarehouseController(
    IWarehouseLoadingService loadingService,
    AppDbContext db,
    IDocumentNumberingService numberingService,
    IAuditService auditService,
    ITelegramNotificationService? telegramService = null) : ControllerBase
{
    private string CurrentUserName() =>
        User.FindFirstValue("fullName")
        ?? User.FindFirstValue(ClaimTypes.Name)
        ?? User.Identity?.Name
        ?? "Xodim";

    private void TryNotifyTelegram(TelegramStageEvent stageEvent)
    {
        if (telegramService == null) return;
        _ = Task.Run(async () =>
        {
            try { await telegramService.NotifyStageChangeAsync(stageEvent); }
            catch { /* ignored */ }
        });
    }
    [HttpGet("loading")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<List<LoadingTaskDto>>>> GetLoadingTasks() =>
        Ok(new ApiResponse<List<LoadingTaskDto>>(true, await loadingService.GetLoadingQueueAsync()));

    [HttpPost("loading/internal-wagons")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> AddInternalWagons([FromBody] AddInternalWagonsRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var result = await loadingService.AddInternalWagonsAsync(userId, request);
            return Ok(new ApiResponse<LoadingTaskDto>(true, result, $"{result.Wagons.Count} ta vagon zavod fondiga qo‘shildi ({result.ArrivalNumber})"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPost("loading/bulk/start")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<string>>> StartBulk([FromBody] BulkLoadingRequest request)
    {
        var ids = (request.UnitIds ?? []).Distinct().ToList();
        if (ids.Count == 0)
            return BadRequest(new ApiResponse<string>(false, null, "Kamida bitta vagonni tanlang"));

        var units = await db.EmptyWagonUnits.Where(u => ids.Contains(u.Id)).ToListAsync();
        if (units.Count != ids.Count)
            return BadRequest(new ApiResponse<string>(false, null, "Tanlangan vagonlardan biri topilmadi"));
        if (units.Any(u => u.Status is not (EmptyWagonUnitStatuses.Estakada or EmptyWagonUnitStatuses.AwaitingTare or EmptyWagonUnitStatuses.Tared)))
            return BadRequest(new ApiResponse<string>(false, null, "Faqat estakadadagi tayyor vagonlarni guruhga olish mumkin"));

        var batch = await numberingService.GenerateOutboundBatchNumberAsync();
        foreach (var unit in units)
        {
            unit.Status = EmptyWagonUnitStatuses.Loading;
            unit.LoadingStartedAt = DateTime.UtcNow;
            unit.LoadingBatchNumber = batch;
            if (!string.IsNullOrWhiteSpace(request.Comment)) unit.LoadingComment = request.Comment.Trim();
        }
        var arrivalIds = units.Select(u => u.EmptyWagonArrivalId).Distinct().ToList();
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .Where(a => arrivalIds.Contains(a.Id))
            .ToListAsync();
        foreach (var arrival in arrivals)
        {
            EmptyWagonUnitSync.SyncMirrors(arrival);
            EmptyWagonUnitSync.DerivePartyStage(arrival);
        }
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "ProductLoadingStarted",
            entityType: nameof(EmptyWagonUnit),
            entityId: batch,
            details: JsonSerializer.Serialize(new
            {
                batchNumber = batch,
                wagonCount = units.Count,
                wagonNumbers = units.Select(u => u.WagonNumber).ToList(),
                comment = request.Comment
            }),
            category: "Warehouse"
        );

        return Ok(new ApiResponse<string>(true, batch, $"{units.Count} ta vagon {batch} yuklash guruhiga olindi"));
    }

    [HttpPost("loading/bulk/complete")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<string>>> CompleteBulk([FromBody] BulkLoadingRequest request)
    {
        var ids = (request.UnitIds ?? []).Distinct().ToList();
        if (ids.Count == 0)
            return BadRequest(new ApiResponse<string>(false, null, "Kamida bitta vagonni tanlang"));
        var units = await db.EmptyWagonUnits.Where(u => ids.Contains(u.Id)).ToListAsync();
        if (units.Count != ids.Count || units.Any(u => u.Status is not (EmptyWagonUnitStatuses.Loading or EmptyWagonUnitStatuses.Estakada or EmptyWagonUnitStatuses.AwaitingTare or EmptyWagonUnitStatuses.Tared)))
            return BadRequest(new ApiResponse<string>(false, null, "Faqat yuklanayotgan yoki estakadadagi vagonlarni tanlang"));

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var userName = (await db.Users.FindAsync(userId))?.FullName?.Trim() ?? string.Empty;
        var completedAt = DateTime.UtcNow;
        string? fallbackBatch = null;
        foreach (var unit in units)
        {
            unit.LoadingStartedAt ??= completedAt;
            unit.Status = EmptyWagonUnitStatuses.Loaded;
            unit.LoadingCompletedAt = completedAt;
            unit.LoadingCompletedByName = userName;
            if (string.IsNullOrWhiteSpace(unit.LoadingBatchNumber))
            {
                fallbackBatch ??= await numberingService.GenerateOutboundBatchNumberAsync();
                unit.LoadingBatchNumber = fallbackBatch;
            }
            if (!string.IsNullOrWhiteSpace(request.Comment)) unit.LoadingComment = request.Comment.Trim();
        }
        var arrivalIds = units.Select(u => u.EmptyWagonArrivalId).Distinct().ToList();
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .Where(a => arrivalIds.Contains(a.Id))
            .ToListAsync();
        foreach (var arrival in arrivals)
        {
            arrival.EconomistNotifiedAt ??= DateTime.UtcNow;
            arrival.LoadingCompletedAt = arrival.Units
                .Where(u => u.LoadingCompletedAt != null)
                .Max(u => (DateTime?)u.LoadingCompletedAt) ?? completedAt;
            arrival.LoadingCompletedByName = userName;
            EmptyWagonUnitSync.SyncMirrors(arrival);
            EmptyWagonUnitSync.DerivePartyStage(arrival);
        }
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            action: "ProductLoaded",
            entityType: nameof(EmptyWagonUnit),
            entityId: string.IsNullOrWhiteSpace(fallbackBatch) ? ids[0].ToString() : fallbackBatch,
            details: JsonSerializer.Serialize(new
            {
                batchNumber = fallbackBatch ?? units[0].LoadingBatchNumber,
                wagonCount = units.Count,
                wagonNumbers = units.Select(u => u.WagonNumber).ToList(),
                comment = request.Comment
            }),
            category: "Warehouse"
        );

        TryNotifyTelegram(new TelegramStageEvent(
            FlowTitle: "YUKLASH VA CHIQARISH",
            StageTitle: "1. Mahsulotni yuklash",
            DepartmentOrRole: "TM va XA sexi",
            OperatorName: userName,
            Identifier: fallbackBatch ?? units[0].LoadingBatchNumber ?? (arrivals.FirstOrDefault()?.ArrivalNumber ?? "Partiya"),
            WagonCount: units.Count,
            WagonNumbers: units.Select(u => u.WagonNumber).ToList(),
            ProductType: units.FirstOrDefault()?.ProductType,
            NextStage: "2. 1C integratsiyasi (Brutto tarozi va plomba)",
            NextDepartment: "1C tizimi / Tarozi",
            Details: request.Comment
        ));

        return Ok(new ApiResponse<string>(true, units[0].LoadingBatchNumber, $"{units.Count} ta vagon yuklandi"));
    }

    [HttpPost("loading/bulk/send-to-scale")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<string>>> SendToScaleBulk([FromBody] BulkLoadingRequest request)
    {
        var ids = (request.UnitIds ?? []).Distinct().ToList();
        if (ids.Count == 0)
            return BadRequest(new ApiResponse<string>(false, null, "Kamida bitta vagonni tanlang"));
        var units = await db.EmptyWagonUnits.Where(u => ids.Contains(u.Id)).ToListAsync();
        if (units.Count != ids.Count || units.Any(u => u.Status != EmptyWagonUnitStatuses.Loaded))
            return BadRequest(new ApiResponse<string>(false, null, "Faqat yuklangan vagonlarni taroziga jo‘natish mumkin"));

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var userName = (await db.Users.FindAsync(userId))?.FullName?.Trim() ?? string.Empty;
        foreach (var unit in units)
        {
            unit.Status = EmptyWagonUnitStatuses.ToRailwayScale;
            if (!string.IsNullOrWhiteSpace(request.Comment)) unit.LoadingComment = request.Comment.Trim();
        }
        var arrivalIds = units.Select(u => u.EmptyWagonArrivalId).Distinct().ToList();
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .Where(a => arrivalIds.Contains(a.Id))
            .ToListAsync();
        foreach (var arrival in arrivals)
        {
            EmptyWagonUnitSync.SyncMirrors(arrival);
            EmptyWagonUnitSync.DerivePartyStage(arrival);
        }
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            userId: userId,
            action: "SentToRailwayScale",
            entityType: nameof(EmptyWagonUnit),
            entityId: ids[0].ToString(),
            details: JsonSerializer.Serialize(new
            {
                wagonCount = units.Count,
                wagonNumbers = units.Select(u => u.WagonNumber).ToList(),
                comment = request.Comment
            }),
            category: "Warehouse"
        );

        return Ok(new ApiResponse<string>(true, null, $"{units.Count} ta vagon taroziga (Brutto/Netto) jo‘natildi"));
    }

    [HttpGet("economist-notifications")]
    [Authorize(Roles = "Economist,Admin,Dispatching")]
    public async Task<ActionResult<ApiResponse<List<LoadingTaskDto>>>> GetEconomistNotifications() =>
        Ok(new ApiResponse<List<LoadingTaskDto>>(true, await loadingService.GetEconomistNotificationsAsync()));

    [HttpPost("loading/{id:guid}/start")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> StartLoading(Guid id, [FromBody] LoadingStartRequest? request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.StartLoadingAsync(id, userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPost("loading/{id:guid}/wagons/{wagonNumber}/start")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> StartWagonLoading(
        Guid id, string wagonNumber, [FromBody] LoadingStartRequest? request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.StartWagonLoadingAsync(id, Uri.UnescapeDataString(wagonNumber), userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Vagon yuklash boshlandi"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPost("loading/{id:guid}/complete")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> CompleteLoading(Guid id, [FromBody] LoadingCompleteRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.CompleteLoadingAsync(id, userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "YUKLASH VA CHIQARISH",
                StageTitle: "1. Mahsulotni yuklash",
                DepartmentOrRole: "TM va XA sexi",
                OperatorName: CurrentUserName(),
                Identifier: task.ArrivalNumber,
                WagonCount: task.Wagons.Count,
                WagonNumbers: task.Wagons.Select(w => w.WagonNumber).ToList(),
                ProductType: task.ProductType,
                NextStage: "2. 1C integratsiyasi (Brutto tarozi va plomba)",
                NextDepartment: "1C tizimi / Tarozi",
                Details: request.Comment
            ));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Yuklash tugadi."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPost("loading/{id:guid}/wagons/{wagonNumber}/complete")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> CompleteWagonLoading(
        Guid id, string wagonNumber, [FromBody] LoadingCompleteRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.CompleteWagonLoadingAsync(id, Uri.UnescapeDataString(wagonNumber), userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            TryNotifyTelegram(new TelegramStageEvent(
                FlowTitle: "YUKLASH VA CHIQARISH",
                StageTitle: "1. Mahsulotni yuklash",
                DepartmentOrRole: "TM va XA sexi",
                OperatorName: CurrentUserName(),
                Identifier: task.ArrivalNumber,
                WagonCount: 1,
                WagonNumbers: [Uri.UnescapeDataString(wagonNumber)],
                ProductType: task.ProductType,
                NextStage: "2. 1C integratsiyasi (Brutto tarozi va plomba)",
                NextDepartment: "1C tizimi / Tarozi",
                Details: request.Comment
            ));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Vagon yuklandi — iqtisodchi xabardor."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPost("loading/{id:guid}/wagons/{wagonNumber}/send-to-scale")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> SendWagonToScale(
        Guid id, string wagonNumber, [FromBody] LoadingCompleteRequest? request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.SendWagonToScaleAsync(id, Uri.UnescapeDataString(wagonNumber), userId, request?.Comment);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Vagon taroziga (Brutto/Netto) jo‘natildi"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPost("loading/{id:guid}/wagons/{wagonNumber}/return")]
    [RequirePermission("flow.loading")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> ReturnWagonLoading(
        Guid id, string wagonNumber, [FromBody] LoadingReturnRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.ReturnWagonLoadingAsync(
                id, Uri.UnescapeDataString(wagonNumber), userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Vagon nuqson bilan qaytarildi."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }


    [HttpPost("loading/{id:guid}/wagons/{wagonNumber}/rollback")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> RollbackWagonLoading(
        Guid id, string wagonNumber, [FromBody] LoadingRollbackRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.RollbackWagonLoadingAsync(
                id, Uri.UnescapeDataString(wagonNumber), userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Vagon holati orqaga qaytarildi."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpPut("loading/{id:guid}/wagons/{wagonNumber}")]
    [Authorize(Roles = "Warehouse,Admin")]
    public async Task<ActionResult<ApiResponse<LoadingTaskDto>>> EditWagonLoading(
        Guid id, string wagonNumber, [FromBody] LoadingWagonEditRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var task = await loadingService.EditWagonLoadingAsync(
                id, Uri.UnescapeDataString(wagonNumber), userId, request);
            if (task is null) return NotFound(new ApiResponse<LoadingTaskDto>(false, null, "Vazifa topilmadi"));
            return Ok(new ApiResponse<LoadingTaskDto>(true, task, "Vagon ma’lumotlari yangilandi."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<LoadingTaskDto>(false, null, ex.Message));
        }
    }

    [HttpGet("loading/units/{unitId:guid}/edit-history")]
    [Authorize(Roles = "Warehouse,Admin,Dispatching")]
    public async Task<ActionResult<ApiResponse<object>>> GetWagonEditHistory(Guid unitId)
    {
        var rows = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(EmptyWagonUnit)
                && a.EntityId == unitId.ToString()
                && a.Action == "LoadingWagonEdited")
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new { a.Id, a.UserId, a.Details, a.CreatedAt })
            .ToListAsync();
        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).Distinct().ToList();
        var users = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);
        var result = rows.Select(r => new
        {
            r.Id,
            EditorName = r.UserId.HasValue && users.TryGetValue(r.UserId.Value, out var name) ? name : "Noma’lum foydalanuvchi",
            r.Details,
            r.CreatedAt,
        });
        return Ok(new ApiResponse<object>(true, result));
    }
}
