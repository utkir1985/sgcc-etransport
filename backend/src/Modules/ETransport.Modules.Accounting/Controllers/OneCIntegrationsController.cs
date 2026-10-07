using System.Security.Claims;
using System.Text.RegularExpressions;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ETransport.Modules.Accounting.Controllers;

public class OneCScalesOptions
{
    public const string SectionName = "OneCScales";
    /// <summary>Faqat environment / bootstrap — UI orqali saqlanganlar DB da (parol shifrlangan).</summary>
    public string BaseUrl { get; set; } = "";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

public record OneCWeighingItemDto(
    string DatetimeIn,
    string DatetimeOut,
    string WagonNumber,
    string WagonCapacityM3,
    string StampNumber,
    string ProductName,
    string InvoiceNumber,
    decimal Tara,
    decimal Brutto,
    decimal Netto,
    string VehicleId,
    string ConfidantName,
    string VidVesi,
    string WeigherName,
    string Channel,
    bool IsManualSeal = false,
    Guid? ArrivalId = null,
    bool IsExited = false,
    bool IsOnSite = false,
    string? ExitedAt = null,
    bool HasRegistry = false,
    string? RegistryNumber = null
);

public record OneCWeighingsResultDto(
    IReadOnlyList<OneCWeighingItemDto> Items,
    int RailwayCount,
    int AutoCount,
    string Date1,
    string Date2,
    DateTime FetchedAt,
    OneCEmptyWagonSyncResult? Sync = null
);

public record OneCManualSealRequest(
    string WagonNumber,
    string SealNumber,
    Guid? ArrivalId = null
);

[ApiController]
[Route("api/integrations/1c")]
[Authorize(Roles = "Admin,Scale,Economist,Security")]
public class OneCIntegrationsController(
    AppDbContext db,
    IOneCEmptyWagonSyncService syncService,
    ILogger<OneCIntegrationsController> logger) : ControllerBase
{
    /// <summary>
    /// 1C tarozi (vesii) dan sana oralig‘idagi tortish ma’lumotlari.
    /// date1/date2: yyyyMMdd. Bo‘sh bo‘lsa — joriy oy boshi … bugun.
    /// Ko‘rsatish sanasi cheklanmaydi (filtrlash UI dagi date1/date2 bo‘yicha).
    /// sync=true — faqat plombali ЖД (30.07.2026 dan) EmptyWagonUnit ga yoziladi.
    /// sealedOnly=true — temir yo‘l ro‘yxatida faqat plombali yozuvlar.
    /// </summary>
    [HttpGet("weighings")]
    public async Task<ActionResult<ApiResponse<OneCWeighingsResultDto>>> GetWeighings(
        [FromQuery] string? date1,
        [FromQuery] string? date2,
        [FromQuery] bool sync = false,
        [FromQuery] bool sealedOnly = false,
        CancellationToken cancellationToken = default)
    {
        var to = OneCEmptyWagonSyncService.NormalizeDate(date2)
                 ?? DateTime.Now.ToString("yyyyMMdd");
        var from = OneCEmptyWagonSyncService.NormalizeDate(date1)
                   ?? new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1).ToString("yyyyMMdd");
        if (string.CompareOrdinal(to, from) < 0) to = from;

        var (raw, error) = await syncService.FetchAsync(from, to, cancellationToken);
        if (error is not null)
            return BadRequest(new ApiResponse<OneCWeighingsResultDto>(false, null, error));

        var recentUnits = await db.EmptyWagonUnits.AsNoTracking()
            .Include(u => u.Arrival)
            .Where(u => u.Arrival != null)
            .OrderByDescending(u => u.Arrival!.ArrivalDate)
            .ThenByDescending(u => u.Arrival!.CreatedAt)
            .ToListAsync(cancellationToken);

        var recentRegistries = await db.LoadingRegistries.AsNoTracking()
            .Where(r => r.ExitedToKengsoyAt != null)
            .OrderByDescending(r => r.ExitedToKengsoyAt)
            .ToListAsync(cancellationToken);

        OneCEmptyWagonSyncResult? syncResult = null;
        if (sync)
        {
            try
            {
                syncResult = await syncService.ApplySealedRailwayAsync(raw, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "1C → EmptyWagon sync xato");
                return Ok(new ApiResponse<OneCWeighingsResultDto>(
                    true,
                    BuildResult(raw, from, to, null, sealedOnly, recentUnits, recentRegistries),
                    $"O‘qildi, lekin tizimga yozishda xato: {ex.Message}"));
            }
        }

        return Ok(new ApiResponse<OneCWeighingsResultDto>(
            true,
            BuildResult(raw, from, to, syncResult, sealedOnly, recentUnits, recentRegistries)));
    }

    /// <summary>Faqat sinxronlash (plombali temir yo‘l → EmptyWagonUnit).</summary>
    [HttpPost("weighings/sync")]
    public async Task<ActionResult<ApiResponse<OneCEmptyWagonSyncResult>>> SyncWeighings(
        [FromQuery] string? date1,
        [FromQuery] string? date2,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await syncService.SyncSealedRailwayAsync(date1, date2, cancellationToken);
            return Ok(new ApiResponse<OneCEmptyWagonSyncResult>(true, result));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<OneCEmptyWagonSyncResult>(false, null, ex.Message));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "1C sync xato");
            return StatusCode(502, new ApiResponse<OneCEmptyWagonSyncResult>(false, null, "Sinxronlashda xatolik"));
        }
    }

    /// <summary>
    /// Admin yoki Tarozi operatori tomonidan 1C da va tizimda plombasi bo‘lmagan
    /// vagon uchun ixtiyoriy matn/plomba kiritish va uni rasmiy plomba deb qabul qilish.
    /// </summary>
    [HttpPost("weighings/manual-seal")]
    [HttpPost("/api/1c/weighings/manual-seal")]
    [Authorize(Roles = "Admin,Scale")]
    public async Task<ActionResult<ApiResponse<object>>> SetManualSeal(
        [FromBody] OneCManualSealRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.WagonNumber))
            return BadRequest(new ApiResponse<object>(false, null, "Vagon raqami kiritilishi shart"));

        if (string.IsNullOrWhiteSpace(request.SealNumber))
            return BadRequest(new ApiResponse<object>(false, null, "Plomba raqami yoki o‘rniga yozuv kiritilishi shart"));

        var cleanWagon = WagonKey(request.WagonNumber);
        if (string.IsNullOrWhiteSpace(cleanWagon))
        {
            cleanWagon = request.WagonNumber.Trim();
        }

        var sealNumber = request.SealNumber.Trim();

        var candidates = db.EmptyWagonUnits.Include(u => u.Arrival)
            .Where(u => u.Arrival != null && u.WagonNumber.Contains(cleanWagon));
        if (request.ArrivalId.HasValue)
            candidates = candidates.Where(u => u.EmptyWagonArrivalId == request.ArrivalId.Value);
        else
            candidates = candidates.Where(u => u.Arrival!.Stage != "Exited" && u.Arrival.Stage != "Cancelled"
                && u.Status != EmptyWagonUnitStatuses.Returned);
        var matchingUnits = await candidates.OrderByDescending(u => u.Arrival!.ArrivalDate)
            .ThenByDescending(u => u.Arrival!.CreatedAt).ToListAsync(cancellationToken);
        var unit = matchingUnits.FirstOrDefault(u => WagonKey(u.WagonNumber) == cleanWagon);

        if (unit is null)
        {
            return NotFound(new ApiResponse<object>(false, null,
                $"{cleanWagon} raqamli vagon tizimning faol partiyalarida topilmadi. Avval vagon qabul qilinganligini tekshiring."));
        }

        if (!string.IsNullOrWhiteSpace(unit.SealNumber))
            return Conflict(new ApiResponse<object>(false, null,
                "Bu vagonda plomba mavjud. Faqat plombasiz vagonga plomba qo‘shish mumkin."));

        // A seal already present in 1C must also be protected before the next sync.
        var arrivalDate = unit.Arrival!.ArrivalDate;
        var (weighings, fetchError) = await syncService.FetchAsync(
            arrivalDate.AddDays(-5).ToString("yyyyMMdd"),
            arrivalDate.AddDays(5).ToString("yyyyMMdd"), cancellationToken);
        if (fetchError != null)
            return StatusCode(502, new ApiResponse<object>(false, null,
                "1C dagi plomba holatini tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring."));
        // Vagon qayta kelgan bo‘lishi mumkin: ±5 kun oralig‘idagi har qanday tortish emas,
        // faqat aynan shu tashrifga tegishli (sanasi shu tashrifga eng yaqin) tortish tekshiriladi.
        // Aks holda oldingi tashrifning plombasi yangi, plombasiz vagonni to‘sib qo‘yadi.
        var siblingArrivalDates = await db.EmptyWagonUnits
            .Where(u => u.Arrival != null && u.Id != unit.Id && u.WagonNumber.Contains(cleanWagon))
            .Select(u => u.Arrival!.ArrivalDate)
            .ToListAsync(cancellationToken);

        var ownWeighings = weighings
            .Where(x => x.Channel == "railway" && WagonKey(x.WagonNumber) == cleanWagon)
            .Where(x =>
            {
                var weighedAt = (OneCEmptyWagonSyncService.ParseLocalDateTime(x.DatetimeOut)
                    ?? OneCEmptyWagonSyncService.ParseLocalDateTime(x.DatetimeIn))?.Date;
                if (weighedAt is null) return true; // sanasi yo‘q yozuvni ehtiyot uchun shu tashrifniki deb qaraymiz
                var ownDiff = Math.Abs((weighedAt.Value - arrivalDate.Date).TotalDays);
                return siblingArrivalDates.All(other => ownDiff <= Math.Abs((weighedAt.Value - other.Date).TotalDays));
            })
            .ToList();

        if (ownWeighings.Any(x => !string.IsNullOrWhiteSpace(x.StampNumber)))
            return Conflict(new ApiResponse<object>(false, null,
                "Bu vagonning 1C da plombasi mavjud. Faqat plombasiz vagonga plomba qo‘shish mumkin."));

        var userName = User.FindFirstValue("fullName")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "Admin";

        unit.SealNumber = sealNumber;
        unit.IsManualSeal = true;
        unit.SealConfirmedByScaleAt = DateTime.UtcNow;
        unit.SealConfirmedByScaleName = userName;
        unit.SealConfirmedBySecurityAt = DateTime.UtcNow;
        unit.SealConfirmedBySecurityName = $"{userName} (Admin)";
        unit.SealEnteredToUngAt = DateTime.UtcNow;

        if (unit.Status is EmptyWagonUnitStatuses.Loading or EmptyWagonUnitStatuses.Loaded
            or EmptyWagonUnitStatuses.ToRailwayScale or EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending)
        {
            unit.Status = EmptyWagonUnitStatuses.Sealed;
            unit.SealedAt = DateTime.UtcNow;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new ApiResponse<object>(false, null,
                "Vagon ma’lumoti o‘zgardi. Jadvalni yangilang va qayta tekshiring."));
        }

        logger.LogInformation("Vagon {Wagon} uchun admin plomba kiritildi: {Seal} (Partiya: {Arrival})",
            cleanWagon, sealNumber, unit.Arrival?.ArrivalNumber);

        return Ok(new ApiResponse<object>(true, new
        {
            arrivalId = unit.EmptyWagonArrivalId,
            isManualSeal = unit.IsManualSeal,
            wagonNumber = cleanWagon,
            sealNumber = sealNumber,
            arrivalNumber = unit.Arrival?.ArrivalNumber,
            status = unit.Status
        }, $"✓ Vagon {cleanWagon} uchun plomba ({sealNumber}) muvaffaqiyatli saqlandi va qabul qilindi!"));
    }

    private static OneCWeighingsResultDto BuildResult(
        IReadOnlyList<OneCWeighingRaw> raw,
        string from,
        string to,
        OneCEmptyWagonSyncResult? syncResult,
        bool sealedOnly,
        IReadOnlyList<EmptyWagonUnit> units,
        IReadOnlyList<LoadingRegistry>? registries = null)
    {
        var regByArrival = (registries ?? [])
            .GroupBy(r => r.EmptyWagonArrivalId)
            .ToDictionary(g => g.Key, g => g.First());

        // Hozir zavod hududida (majmuada) bo‘lgan vagonlar to‘plami:
        var onSiteWagonSet = new HashSet<string>(
            units
                .Where(u => u.ScaleExitedAt == null
                         && u.Status != EmptyWagonUnitStatuses.Returned
                         && u.Arrival?.Stage is not ("Exited" or "ExitedToKengsoy" or "Cancelled"))
                .Select(u => WagonKey(u.WagonNumber))
                .Where(k => !string.IsNullOrWhiteSpace(k)),
            StringComparer.OrdinalIgnoreCase
        );

        var mapped = raw.Select(x =>
        {
            var stamp = x.StampNumber?.Trim() ?? "";
            EmptyWagonUnit? unit = null;
            if (x.Channel == "railway")
            {
                var date = OneCEmptyWagonSyncService.ParseLocalDateTime(x.DatetimeOut)
                    ?? OneCEmptyWagonSyncService.ParseLocalDateTime(x.DatetimeIn);
                if (date.HasValue)
                    unit = units.Where(u => WagonKey(u.WagonNumber) == WagonKey(x.WagonNumber)
                            && Math.Abs((u.Arrival!.ArrivalDate.Date - date.Value.Date).TotalDays) <= 5)
                        .OrderBy(u => Math.Abs((u.Arrival!.ArrivalDate.Date - date.Value.Date).TotalDays))
                        .FirstOrDefault();
                if (unit != null && (unit.IsManualSeal || string.IsNullOrWhiteSpace(stamp)))
                    stamp = unit.SealNumber;
            }

            var wagonKey = WagonKey(x.WagonNumber);
            var isOnSite = x.Channel == "railway" && !string.IsNullOrWhiteSpace(wagonKey) && onSiteWagonSet.Contains(wagonKey);

            LoadingRegistry? reg = null;
            if (unit != null)
                regByArrival.TryGetValue(unit.EmptyWagonArrivalId, out reg);

            var hasRegistry = reg != null && unit?.Status != EmptyWagonUnitStatuses.Returned;
            var isExited = hasRegistry || (unit != null && unit.Arrival?.Stage is ("Exited" or "ExitedToKengsoy") && unit.Status != EmptyWagonUnitStatuses.Returned);
            var exitedAt = reg?.ExitedToKengsoyAt?.ToString("yyyy-MM-dd HH:mm:ss") ?? unit?.ScaleExitedAt?.ToString("yyyy-MM-dd HH:mm:ss");

            return MapDto(x, stamp) with {
                IsManualSeal = unit?.IsManualSeal ?? false,
                ArrivalId = unit?.EmptyWagonArrivalId,
                IsExited = isExited,
                IsOnSite = isOnSite,
                ExitedAt = exitedAt,
                HasRegistry = hasRegistry,
                RegistryNumber = reg?.RegistryNumber
            };
        }).ToList();

        // Ko‘rsatish: sana oralig‘i 1C so‘rovida; sealedOnly — faqat plombali ЖД
        var items = mapped
            .Where(i =>
            {
                if (!sealedOnly) return true;
                if (i.Channel != "railway") return true;
                return !string.IsNullOrWhiteSpace(i.StampNumber);
            })
            .OrderByDescending(x => x.DatetimeOut)
            .ThenByDescending(x => x.DatetimeIn)
            .ToList();

        return new OneCWeighingsResultDto(
            items,
            items.Count(i => i.Channel == "railway"),
            items.Count(i => i.Channel == "auto"),
            from,
            to,
            DateTime.UtcNow,
            syncResult);
    }

    private static string WagonKey(string value)
    {
        var match = Regex.Match(value, @"(?<!\d)\d{8}(?!\d)");
        return match.Success ? match.Value : value.Trim();
    }

    private static OneCWeighingItemDto MapDto(OneCWeighingRaw x, string? effectiveStamp = null) =>
        new(
            x.DatetimeIn,
            x.DatetimeOut,
            x.WagonNumber,
            x.WagonCapacityM3,
            effectiveStamp ?? x.StampNumber,
            x.ProductName,
            x.InvoiceNumber,
            x.Tara,
            x.Brutto,
            x.Netto,
            x.VehicleId,
            x.ConfidantName,
            x.VidVesi,
            x.WeigherName,
            x.Channel);
}