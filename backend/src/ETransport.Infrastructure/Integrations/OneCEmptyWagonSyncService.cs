using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Integrations;

public record OneCWeighingRaw(
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
    string Channel
);

public record OneCSyncAppliedItem(
    string WagonNumber,
    string StampNumber,
    string ArrivalNumber,
    string TareTn,
    string GrossTn,
    string? DatetimeOut,
    string Action
);

public record OneCEmptyWagonSyncResult(
    int FetchedRailway,
    int SealedCandidates,
    int Updated,
    int SkippedNoMatch,
    int SkippedUnchanged,
    IReadOnlyList<OneCSyncAppliedItem> Applied,
    IReadOnlyList<string> UnmatchedWagons,
    DateTime SyncedAt
);

public interface IOneCEmptyWagonSyncService
{
    /// <summary>1C vesii dan tortishlarni o‘qish (sana: yyyyMMdd).</summary>
    Task<(IReadOnlyList<OneCWeighingRaw> Items, string? Error)> FetchAsync(
        string date1,
        string date2,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// 30.07.2026 dan plombali temir yo‘l tortishlarini EmptyWagonUnit ga yozadi:
    /// Tara, Brutto, chiqish vaqti, plomba raqami — struktura bo‘yicha.
    /// </summary>
    Task<OneCEmptyWagonSyncResult> SyncSealedRailwayAsync(
        string? date1 = null,
        string? date2 = null,
        CancellationToken cancellationToken = default);

    /// <summary>Allaqachon o‘qilgan 1C yozuvlarini tizimga qo‘llash (qo‘shimcha HTTP yo‘q).</summary>
    Task<OneCEmptyWagonSyncResult> ApplySealedRailwayAsync(
        IReadOnlyList<OneCWeighingRaw> items,
        CancellationToken cancellationToken = default);
}

public partial class OneCEmptyWagonSyncService(
    AppDbContext db,
    IHttpClientFactory httpClientFactory,
    IIntegrationCredentialsService credentials,
    ILogger<OneCEmptyWagonSyncService> logger) : IOneCEmptyWagonSyncService
{
    /// <summary>Plomba jarayoni boshlangan sana (mahalliy).</summary>
    public static readonly DateTime SealProcessStartLocal = new(2026, 7, 30);

    public static string SealProcessStartYmd => "20260730";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<(IReadOnlyList<OneCWeighingRaw> Items, string? Error)> FetchAsync(
        string date1,
        string date2,
        CancellationToken cancellationToken = default)
    {
        var cfg = await credentials.ResolveOneCForCallAsync(cancellationToken);
        if (cfg is null)
            return ([], "1C login/parol sozlanmagan");

        try
        {
            var client = httpClientFactory.CreateClient("OneCScales");
            using var request = new HttpRequestMessage(HttpMethod.Post, cfg.BaseUrl);
            var authBytes = Encoding.UTF8.GetBytes($"{cfg.Username}:{cfg.Password}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { date1, date2 }),
                Encoding.UTF8,
                "application/json");

            using var response = await client.SendAsync(request, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("1C vesii HTTP {Status}: {Body}", (int)response.StatusCode, Truncate(raw));
                return ([], $"1C javob bermadi ({(int)response.StatusCode})");
            }

            OneCRawResponse? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<OneCRawResponse>(raw, JsonOptions);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "1C vesii JSON parse xato");
                return ([], "1C javobi o‘qilmadi");
            }

            var items = (parsed?.Data ?? [])
                .Select(MapRaw)
                .ToList();
            return (items, null);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return ([], "1C javob bermadi (timeout)");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "1C vesii so‘rovida xato");
            return ([], "1C bilan ulanishda xatolik");
        }
    }

    public async Task<OneCEmptyWagonSyncResult> SyncSealedRailwayAsync(
        string? date1 = null,
        string? date2 = null,
        CancellationToken cancellationToken = default)
    {
        var from = ClampFrom(NormalizeDate(date1) ?? SealProcessStartYmd);
        var to = NormalizeDate(date2) ?? DateTime.Now.ToString("yyyyMMdd");
        if (string.CompareOrdinal(to, from) < 0) to = from;

        var (items, error) = await FetchAsync(from, to, cancellationToken);
        if (error is not null)
            throw new InvalidOperationException(error);

        return await ApplySealedRailwayAsync(items, cancellationToken);
    }

    public async Task<OneCEmptyWagonSyncResult> ApplySealedRailwayAsync(
        IReadOnlyList<OneCWeighingRaw> items,
        CancellationToken cancellationToken = default)
    {
        var railwayItems = items
            .Where(i => i.Channel == "railway")
            .Where(i => !string.IsNullOrWhiteSpace(i.WagonNumber))
            .Where(IsOnOrAfterSealStart)
            .ToList();

        var fromDate = DateTime.SpecifyKind(SealProcessStartLocal.Date, DateTimeKind.Utc);
        var units = await db.EmptyWagonUnits
            .Include(u => u.Arrival)
            .Where(u => u.Arrival != null && u.Arrival.ArrivalDate >= fromDate)
            .ToListAsync(cancellationToken);

        // Group 1C items by 8-digit wagon number
        var oneCByWagon = railwayItems
            .GroupBy(i => PrimaryWagonKey(i.WagonNumber), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var applied = new List<OneCSyncAppliedItem>();
        var unmatched = new List<string>();
        var skippedUnchanged = 0;
        var touchedArrivals = new HashSet<Guid>();

        // Bitta tortish bitta tashrifga: moslashtirish oldindan, global tarzda hisoblanadi.
        var matchedItems = MatchWeighingsToVisits(units, oneCByWagon);

        foreach (var unit in units)
        {
            if (unit.Arrival is null) continue;
            if (!matchedItems.TryGetValue(unit.Id, out var item)) continue;

            var (parsedWagon, parsedCisterns) = ParseWagonAndCisterns(item.WagonNumber);
            var tareTn = FormatTons(ToTons(item.Tara));
            var grossTn = FormatTons(ToTons(item.Brutto));
            var dtIn = ParseLocalDateTime(item.DatetimeIn);
            var dtOut = ParseLocalDateTime(item.DatetimeOut);
            var stamp = item.StampNumber.Trim();

            var changed = false;

            // Wagon & Cistern numbers for platforms
            if (parsedCisterns.Count > 0)
            {
                var cisternJoined = string.Join(", ", parsedCisterns);
                if (!string.Equals(unit.CisternNumber?.Trim(), cisternJoined, StringComparison.OrdinalIgnoreCase))
                {
                    unit.CisternNumber = cisternJoined;
                    changed = true;
                }
                if (unit.WagonType?.ToLowerInvariant() != "platform")
                {
                    unit.WagonType = "platform";
                    changed = true;
                }
                if (string.IsNullOrWhiteSpace(unit.PlatformTareWeight))
                {
                    unit.PlatformTareWeight = "21.50";
                    changed = true;
                }
                if (string.IsNullOrWhiteSpace(unit.ContainerTareWeights) && !string.IsNullOrWhiteSpace(tareTn))
                {
                    if (decimal.TryParse(tareTn, NumberStyles.Any, CultureInfo.InvariantCulture, out var tVal))
                    {
                        var contEach = Math.Max(0, (tVal - 21.50m) / parsedCisterns.Count);
                        unit.ContainerTareWeights = string.Join(", ", parsedCisterns.Select(c => $"{c}:{FormatTons(contEach)}"));
                        changed = true;
                    }
                }
            }

            // Weights
            if (!string.IsNullOrWhiteSpace(tareTn) && !SameWeight(unit.TareWeight, tareTn))
            {
                unit.TareWeight = tareTn;
                changed = true;
            }

            if (!string.IsNullOrWhiteSpace(grossTn) && !SameWeight(unit.GrossWeight, grossTn))
            {
                unit.GrossWeight = grossTn;
                changed = true;
            }

            if (dtIn is not null && unit.TareWeighedAt != dtIn)
            {
                unit.TareWeighedAt = ToUtc(dtIn.Value);
                changed = true;
            }

            if (dtOut is not null)
            {
                var outUtc = ToUtc(dtOut.Value);
                if (unit.GrossWeighedAt != outUtc)
                {
                    unit.GrossWeighedAt = outUtc;
                    changed = true;
                }
            }

            // Product
            if (!string.IsNullOrWhiteSpace(item.ProductName))
            {
                var prod = CyrillicToLatin.ToProductName(item.ProductName);
                if (!string.IsNullOrWhiteSpace(prod))
                {
                    var isGenericLpg = prod.Equals("Suyultirilgan gaz", StringComparison.OrdinalIgnoreCase);
                    var hasSpecificLpg = !string.IsNullOrWhiteSpace(unit.ProductType)
                        && (unit.ProductType.Contains("Propan", StringComparison.OrdinalIgnoreCase)
                            || unit.ProductType.Contains("Butan", StringComparison.OrdinalIgnoreCase));

                    if (!isGenericLpg || !hasSpecificLpg)
                    {
                        if (string.IsNullOrWhiteSpace(unit.ProductType) || unit.ProductType != prod)
                        {
                            unit.ProductType = prod;
                            changed = true;
                        }
                    }
                    if (string.IsNullOrWhiteSpace(unit.Arrival.ProductType) || unit.Arrival.ProductType != prod)
                    {
                        unit.Arrival.ProductType = prod;
                        changed = true;
                    }
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(unit.ProductType))
                {
                    var single = EmptyWagonUnitSync.SingleProductOnly(unit.Arrival?.ProductType);
                    if (!string.IsNullOrWhiteSpace(single))
                    {
                        unit.ProductType = single;
                        changed = true;
                    }
                }
                if (string.IsNullOrWhiteSpace(unit.Arrival?.ProductType) && !string.IsNullOrWhiteSpace(unit.ProductType))
                {
                    unit.Arrival.ProductType = unit.ProductType;
                    changed = true;
                }
            }

            // Seal
            if (!unit.IsManualSeal && !string.IsNullOrWhiteSpace(stamp)
                && !string.Equals(unit.SealNumber?.Trim(), stamp, StringComparison.OrdinalIgnoreCase))
            {
                unit.SealNumber = stamp;
                unit.SealEnteredToUngAt ??= unit.GrossWeighedAt ?? DateTime.UtcNow;
                changed = true;
            }

            // Status promotion
            if (!string.IsNullOrWhiteSpace(unit.TareWeight) && !string.IsNullOrWhiteSpace(unit.GrossWeight))
            {
                if (unit.Arrival?.Stage is "RailwayInspected" or "KengsoyInspection" or "SecurityInspection")
                {
                    // keep current stage
                }
                else if (unit.Status is EmptyWagonUnitStatuses.AwaitingTare
                    or EmptyWagonUnitStatuses.Tared
                    or EmptyWagonUnitStatuses.Estakada
                    or EmptyWagonUnitStatuses.Loading
                    or EmptyWagonUnitStatuses.Loaded
                    or EmptyWagonUnitStatuses.ToRailwayScale
                    or EmptyWagonUnitStatuses.GrossWeighed
                    or EmptyWagonUnitStatuses.SealPending)
                {
                    if (!string.IsNullOrWhiteSpace(unit.SealNumber))
                    {
                        unit.SealEnteredToUngAt ??= unit.GrossWeighedAt ?? DateTime.UtcNow;
                        unit.Status = unit.SealConfirmedBySecurityAt != null
                            ? EmptyWagonUnitStatuses.Sealed
                            : EmptyWagonUnitStatuses.SealPending;
                        if (unit.Status == EmptyWagonUnitStatuses.Sealed)
                        {
                            unit.SealedAt ??= unit.GrossWeighedAt ?? DateTime.UtcNow;
                        }
                        changed = true;
                    }
                    else
                    {
                        unit.Status = EmptyWagonUnitStatuses.GrossWeighed;
                        changed = true;
                    }
                }
            }

            if (!changed)
            {
                skippedUnchanged++;
                continue;
            }

            touchedArrivals.Add(unit.EmptyWagonArrivalId);
            applied.Add(new OneCSyncAppliedItem(
                unit.WagonNumber,
                unit.SealNumber ?? "",
                unit.Arrival.ArrivalNumber,
                unit.TareWeight,
                unit.GrossWeight,
                unit.ScaleExitedAt?.ToString("yyyy-MM-dd HH:mm") ?? item.DatetimeOut,
                "updated"));
        }

        foreach (var arrivalId in touchedArrivals)
        {
            var arrival = await db.EmptyWagonArrivals
                .Include(a => a.Units)
                .FirstOrDefaultAsync(a => a.Id == arrivalId, cancellationToken);
            if (arrival is null) continue;

            EmptyWagonUnitSync.SyncMirrors(arrival);
            MaybeAdvanceToSealInstallation(arrival);
            EmptyWagonUnitSync.DerivePartyStage(arrival);
        }

        if (applied.Count > 0 || touchedArrivals.Count > 0)
            await db.SaveChangesAsync(cancellationToken);

        return new OneCEmptyWagonSyncResult(
            items.Count(i => i.Channel == "railway"),
            railwayItems.Count,
            applied.Count,
            unmatched.Count,
            skippedUnchanged,
            applied,
            unmatched.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList(),
            DateTime.UtcNow);
    }

    private async Task<int> CreateMissingSealedUnitsAsync(
        List<OneCWeighingRaw> sealedRailway,
        List<string> unmatchedKeys,
        List<OneCSyncAppliedItem> applied,
        HashSet<Guid> touchedArrivals,
        CancellationToken cancellationToken)
    {
        if (unmatchedKeys.Count == 0) return 0;

        var unmatchedSet = new HashSet<string>(unmatchedKeys, StringComparer.OrdinalIgnoreCase);
        var toCreate = sealedRailway
            .Where(i => unmatchedSet.Contains(PrimaryWagonKey(i.WagonNumber)))
            .ToList();
        if (toCreate.Count == 0) return 0;

        // Boshqa partiyada allaqachon bor vagonlarni qayta yaratmaslik
        var allNumbers = await db.EmptyWagonUnits
            .AsNoTracking()
            .Select(u => u.WagonNumber)
            .ToListAsync(cancellationToken);
        var existingAnywhere = new HashSet<string>(
            allNumbers.Select(PrimaryWagonKey),
            StringComparer.OrdinalIgnoreCase);

        toCreate = toCreate
            .Where(i => !existingAnywhere.Contains(PrimaryWagonKey(i.WagonNumber)))
            .ToList();
        if (toCreate.Count == 0) return 0;

        var creatorId = await db.Users
            .AsNoTracking()
            .Where(u => u.IsActive && (u.Role == "Admin" || u.Role == "Scale" || u.Role == "Railway"))
            .OrderBy(u => u.Role == "Admin" ? 0 : u.Role == "Scale" ? 1 : 2)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (creatorId == Guid.Empty)
        {
            logger.LogWarning("1C create: tizimda Admin/Scale user yo‘q");
            return 0;
        }

        var created = 0;
        foreach (var dayGroup in toCreate.GroupBy(i =>
                     (ParseLocalDateTime(i.DatetimeOut) ?? ParseLocalDateTime(i.DatetimeIn) ?? SealProcessStartLocal).Date))
        {
            var day = dayGroup.Key;
            var arrivalNumber = $"1C-{day:yyyyMMdd}";
            var arrival = await db.EmptyWagonArrivals
                .Include(a => a.Units)
                .FirstOrDefaultAsync(a => a.ArrivalNumber == arrivalNumber, cancellationToken);

            if (arrival is null)
            {
                var product = CyrillicToLatin.ToProductName(
                    dayGroup.Select(x => x.ProductName).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p))
                    ?? "1C tortish");
                if (product.Length > 200) product = product[..200];

                arrival = new EmptyWagonArrival
                {
                    ArrivalNumber = arrivalNumber,
                    ArrivalDate = DateTime.SpecifyKind(day, DateTimeKind.Utc),
                    Stage = "SealInstallation",
                    ProductType = product,
                    Notes = "1C vesii dan avtomatik kiritilgan (plombali, 30.07.2026+)",
                    CreatedById = creatorId,
                    CreatedAt = DateTime.UtcNow,
                };
                db.EmptyWagonArrivals.Add(arrival);
            }
            else
            {
                arrival.Stage = "SealInstallation";
                var product = CyrillicToLatin.ToProductName(
                    dayGroup.Select(x => x.ProductName).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p)));
                if (!string.IsNullOrWhiteSpace(product) && arrival.ProductType != product)
                {
                    if (product.Length > 200) product = product[..200];
                    arrival.ProductType = product;
                }
            }

            var sort = arrival.Units.Count;
            foreach (var item in dayGroup.OrderBy(x => x.DatetimeOut))
            {
                var wagon = PrimaryWagonKey(item.WagonNumber);
                if (string.IsNullOrWhiteSpace(wagon)) continue;
                if (arrival.Units.Any(u =>
                        string.Equals(PrimaryWagonKey(u.WagonNumber), wagon, StringComparison.OrdinalIgnoreCase)))
                    continue;

                var tareTn = FormatTons(ToTons(item.Tara));
                var grossTn = FormatTons(ToTons(item.Brutto));
                var dtIn = ParseLocalDateTime(item.DatetimeIn);
                var dtOut = ParseLocalDateTime(item.DatetimeOut);
                var outUtc = dtOut is null ? (DateTime?)null : ToUtc(dtOut.Value);
                var inUtc = dtIn is null ? (DateTime?)null : ToUtc(dtIn.Value);

                var unit = new EmptyWagonUnit
                {
                    EmptyWagonArrivalId = arrival.Id,
                    WagonNumber = wagon,
                    SortOrder = sort++,
                    TareWeight = tareTn,
                    GrossWeight = grossTn,
                    TareWeighedAt = inUtc,
                    GrossWeighedAt = outUtc,
                    ScaleExitedAt = outUtc,
                    SealNumber = item.StampNumber.Trim(),
                    SealConfirmedByScaleAt = null,
                    SealConfirmedByScaleName = string.Empty,
                    SealEnteredToUngAt = outUtc ?? DateTime.UtcNow,
                    SealConfirmedBySecurityAt = null,
                    SealConfirmedBySecurityName = string.Empty,
                    SealConfirmedByEconomistAt = null,
                    SealConfirmedByEconomistName = string.Empty,
                    SealedAt = null,
                    Status = EmptyWagonUnitStatuses.SealPending,
                };
                arrival.Units.Add(unit);
                db.EmptyWagonUnits.Add(unit);
                existingAnywhere.Add(wagon);
                created++;

                applied.Add(new OneCSyncAppliedItem(
                    wagon,
                    unit.SealNumber,
                    arrival.ArrivalNumber,
                    unit.TareWeight,
                    unit.GrossWeight,
                    unit.ScaleExitedAt?.ToString("yyyy-MM-dd HH:mm") ?? item.DatetimeOut,
                    "created"));
            }

            touchedArrivals.Add(arrival.Id);
            EmptyWagonUnitSync.SyncMirrors(arrival);
            arrival.Stage = "SealInstallation";
        }

        return created;
    }

    /// <summary>
    /// Zavoddan chiqib ketgan tashrif hujjatlar bilan yopilgan hisoblanadi: 1C keyin
    /// yuborgan tortish uni avtomatik qayta yozmasligi kerak. 1C ning o‘z partiyalari
    /// (1C-...) bundan mustasno — ular tortish paytidayoq chiqqan deb yoziladi.
    /// </summary>
    private static bool IsClosedVisit(EmptyWagonUnit unit) =>
        unit.ScaleExitedAt is not null
        && !(unit.Arrival?.ArrivalNumber ?? string.Empty).StartsWith("1C-", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Har bir 1C tortishini faqat bitta tashrifga biriktiradi. Vagon qayta kelganda
    /// bir yozuv ikkala tashrifga tushib, eski hujjatning plombasi va og‘irligini
    /// o‘zgartirib yubormasligi uchun eng yaqin juftlikdan boshlab taqsimlanadi.
    /// </summary>
    private static Dictionary<Guid, OneCWeighingRaw> MatchWeighingsToVisits(
        IReadOnlyList<EmptyWagonUnit> units,
        IReadOnlyDictionary<string, List<OneCWeighingRaw>> oneCByWagon)
    {
        var pairs = new List<(EmptyWagonUnit Unit, string ItemKey, OneCWeighingRaw Item, double DiffDays)>();

        foreach (var unit in units)
        {
            if (unit.Arrival is null || IsClosedVisit(unit)) continue;
            var key = PrimaryWagonKey(unit.WagonNumber);
            if (string.IsNullOrWhiteSpace(key)) continue;
            if (!oneCByWagon.TryGetValue(key, out var candItems) || candItems.Count == 0) continue;

            var arrDate = unit.Arrival.ArrivalDate.Date;
            for (var i = 0; i < candItems.Count; i++)
            {
                var candDt = (ParseLocalDateTime(candItems[i].DatetimeOut) ?? ParseLocalDateTime(candItems[i].DatetimeIn))?.Date;
                if (candDt is null) continue;

                var diffDays = Math.Abs((candDt.Value - arrDate).TotalDays);
                if (diffDays <= 5.0)
                    pairs.Add((unit, $"{key}#{i}", candItems[i], diffDays));
            }
        }

        var matched = new Dictionary<Guid, OneCWeighingRaw>();
        var usedItems = new HashSet<string>(StringComparer.Ordinal);

        foreach (var pair in pairs
            .OrderBy(p => p.DiffDays)
            .ThenByDescending(p => p.Unit.Arrival!.ArrivalDate)
            .ThenBy(p => p.ItemKey, StringComparer.Ordinal))
        {
            if (matched.ContainsKey(pair.Unit.Id) || usedItems.Contains(pair.ItemKey)) continue;
            matched[pair.Unit.Id] = pair.Item;
            usedItems.Add(pair.ItemKey);
        }

        return matched;
    }

    /// <summary>
    /// Plomba 1C dan kelgan partiyani SealInstallation ga o‘tkazadi —
    /// Scale / Security / Economist jarayonida ko‘rinishi uchun.
    /// </summary>
    private static void MaybeAdvanceToSealInstallation(EmptyWagonArrival arrival)
    {
        // Temir yo'l ko'rigi yoki ruxsatnoma/qo'riqlash kelishuvi bosqichidagi partiyani
        // 1C avtomatik tarzda SealInstallation ga surib yubormasligi kerak!
        if (arrival.Stage is "RailwayInspected" or "KengsoyInspection" or "SecurityInspection" or "ReadyForEstakada")
            return;

        if (arrival.Units.Any(u => u.Status == EmptyWagonUnitStatuses.ToRailwayScale))
        {
            arrival.Stage = "ToRailwayScale";
            return;
        }

        var ready = arrival.Units.Any(u =>
            !string.IsNullOrWhiteSpace(u.SealNumber)
            && !string.IsNullOrWhiteSpace(u.TareWeight)
            && !string.IsNullOrWhiteSpace(u.GrossWeight)
            && u.Status is EmptyWagonUnitStatuses.GrossWeighed
                or EmptyWagonUnitStatuses.SealPending
                or EmptyWagonUnitStatuses.Sealed);

        if (!ready) return;

        if (arrival.Stage is "Sealed" or "RegistryPrepared" or "DocumentsIssued" or "Exited")
            return;

        arrival.Stage = "SealInstallation";
    }

    private static EmptyWagonUnit? PickBestUnit(List<EmptyWagonUnit> candidates, OneCWeighingRaw item)
    {
        var weighingDate = (ParseLocalDateTime(item.DatetimeOut) ?? ParseLocalDateTime(item.DatetimeIn))?.Date;
        if (weighingDate is null) return null;

        var validCandidates = candidates
            .Where(u => u.Arrival is not null && weighingDate.Value >= u.Arrival.ArrivalDate.Date)
            .ToList();

        if (validCandidates.Count == 0) return null;

        return validCandidates
            .OrderByDescending(u => ScoreUnit(u, weighingDate.Value))
            .ThenByDescending(u => u.Arrival?.ArrivalDate ?? DateTime.MinValue)
            .ThenByDescending(u => u.GrossWeighedAt ?? u.TareWeighedAt ?? DateTime.MinValue)
            .FirstOrDefault();
    }

    private static int ScoreUnit(EmptyWagonUnit u, DateTime weighingDate)
    {
        if (u.Status is EmptyWagonUnitStatuses.Returned) return -100;
        if (u.Arrival is null) return -100;
        if (weighingDate < u.Arrival.ArrivalDate.Date) return -100;

        var score = 0;
        var stage = u.Arrival.Stage ?? "";
        if (stage is not ("Exited" or "Cancelled")) score += 20;
        if (u.Status is EmptyWagonUnitStatuses.Loaded
            or EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Sealed) score += 10;
        if (u.Arrival.ArrivalDate.Date <= weighingDate)
            score += 5;
        if (string.IsNullOrWhiteSpace(u.GrossWeight)) score += 2; // bo‘sh brutto — 1C yozishi kerak
        return score;
    }

    public static (string WagonNumber, List<string> CisternNumbers) ParseWagonAndCisterns(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return (string.Empty, new List<string>());

        var m = EightDigits().Match(raw);
        var wagon = m.Success ? m.Value : (raw.Trim().Split([' ', '\t', '/', ','], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty).Trim();

        var tokens = raw.Split([' ', '\t', ','], StringSplitOptions.RemoveEmptyEntries);
        var cisterns = new List<string>();

        for (var i = 0; i < tokens.Length; i++)
        {
            var t = tokens[i].Trim();
            if (t.Contains('/'))
            {
                // If previous token was 2-4 digits (like "010" in "010 246/5"), combine them
                if (i > 0 && tokens[i - 1].Length is >= 2 and <= 4 && tokens[i - 1].All(char.IsDigit))
                {
                    t = tokens[i - 1] + t;
                }
                t = Regex.Replace(t, @"\s+", "");
                if (!cisterns.Contains(t, StringComparer.OrdinalIgnoreCase) && !string.Equals(t, wagon, StringComparison.OrdinalIgnoreCase))
                {
                    cisterns.Add(t);
                }
            }
        }

        return (wagon, cisterns);
    }

    public static string PrimaryWagonKey(string raw)
    {
        var m = EightDigits().Match(raw ?? "");
        if (m.Success) return m.Value;
        var token = (raw ?? "").Trim().Split([' ', '\t', '/', ','], StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault() ?? "";
        return token.Trim();
    }

    /// <summary>1C odatda kg (37240); tizim tn (37.24). 200 dan kichik bo‘lsa — allaqachon tn.</summary>
    public static decimal ToTons(decimal value)
    {
        if (value <= 0) return 0;
        return value >= 200m ? value / 1000m : value;
    }

    public static string FormatTons(decimal tons) =>
        tons <= 0 ? "" : tons.ToString("0.###", CultureInfo.InvariantCulture);

    private static bool SameWeight(string? existing, string next)
    {
        if (!EmptyWagonUnitSync.TryParseWeight(existing, out var a)) return false;
        if (!EmptyWagonUnitSync.TryParseWeight(next, out var b)) return false;
        return Math.Abs(a - b) < 0.001m;
    }

    private static bool IsOnOrAfterSealStart(OneCWeighingRaw item)
    {
        var dt = ParseLocalDateTime(item.DatetimeOut) ?? ParseLocalDateTime(item.DatetimeIn);
        if (dt is null) return true; // sana yo‘q — date1/date2 filtri yetarli
        return dt.Value.Date >= SealProcessStartLocal.Date;
    }

    public static DateTime? ParseLocalDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dt))
            return DateTime.SpecifyKind(dt, DateTimeKind.Unspecified);
        if (DateTime.TryParse(value, out dt))
            return DateTime.SpecifyKind(dt, DateTimeKind.Unspecified);
        return null;
    }

    private static DateTime ToUtc(DateTime localUnspecified)
    {
        var unspecified = DateTime.SpecifyKind(localUnspecified, DateTimeKind.Unspecified);
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tashkent");
            return TimeZoneInfo.ConvertTimeToUtc(unspecified, tz);
        }
        catch
        {
            return DateTime.SpecifyKind(unspecified, DateTimeKind.Utc);
        }
    }

    private static string ClampFrom(string ymd) =>
        string.CompareOrdinal(ymd, SealProcessStartYmd) < 0 ? SealProcessStartYmd : ymd;

    public static string? NormalizeDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var digits = new string(value.Where(char.IsDigit).ToArray());
        if (digits.Length == 8) return digits;
        if (DateTime.TryParse(value, out var dt)) return dt.ToString("yyyyMMdd");
        return null;
    }

    private static OneCWeighingRaw MapRaw(OneCRawItem x)
    {
        var vid = (x.VidVesi ?? "").Trim();
        var wagon = (x.WagonNumber ?? "").Trim();
        var vehicle = (x.VehicleId ?? "").Trim();
        return new OneCWeighingRaw(
            x.DatetimeIn ?? "",
            x.DatetimeOut ?? "",
            wagon,
            (x.WagonCapacityM3 ?? "").Trim(),
            (x.StampNumber ?? "").Trim(),
            (x.ProductName ?? "").Trim(),
            (x.InvoiceNumber ?? "").Trim(),
            x.Tara,
            x.Brutto,
            x.Netto,
            vehicle,
            (x.ConfidantName ?? "").Trim(),
            vid,
            (x.WeigherName ?? "").Trim(),
            ResolveChannel(vid, wagon, vehicle));
    }

    private static string ResolveChannel(string vidVesi, string wagonNumber, string vehicleId)
    {
        var v = vidVesi.ToLowerInvariant();
        if (v.Contains("жд") || v.Contains("jd") || v.Contains("temir") || v.Contains("railway"))
            return "railway";
        if (v.Contains("авто") || v.Contains("avto") || v.Contains("auto"))
            return "auto";
        if (!string.IsNullOrWhiteSpace(wagonNumber)) return "railway";
        if (!string.IsNullOrWhiteSpace(vehicleId)) return "auto";
        return "other";
    }

    private static string Truncate(string? s) =>
        string.IsNullOrEmpty(s) ? "" : (s.Length <= 400 ? s : s[..400] + "…");

    [GeneratedRegex(@"\d{8}")]
    private static partial Regex EightDigits();

    private sealed class OneCRawResponse
    {
        [JsonPropertyName("data")]
        public List<OneCRawItem>? Data { get; set; }
    }

    private sealed class OneCRawItem
    {
        [JsonPropertyName("datetime_in")]
        public string? DatetimeIn { get; set; }

        [JsonPropertyName("datetime_out")]
        public string? DatetimeOut { get; set; }

        [JsonPropertyName("wagonNumber")]
        public string? WagonNumber { get; set; }

        [JsonPropertyName("wagonCapacityM3")]
        public string? WagonCapacityM3 { get; set; }

        [JsonPropertyName("stampNumber")]
        public string? StampNumber { get; set; }

        [JsonPropertyName("productName")]
        public string? ProductName { get; set; }

        [JsonPropertyName("invoiceNumber")]
        public string? InvoiceNumber { get; set; }

        [JsonPropertyName("tara")]
        public decimal Tara { get; set; }

        [JsonPropertyName("brutto")]
        public decimal Brutto { get; set; }

        [JsonPropertyName("netto")]
        public decimal Netto { get; set; }

        [JsonPropertyName("vehicle_id")]
        public string? VehicleId { get; set; }

        [JsonPropertyName("confidant_name")]
        public string? ConfidantName { get; set; }

        [JsonPropertyName("VidVesi")]
        public string? VidVesi { get; set; }

        [JsonPropertyName("weigherName")]
        public string? WeigherName { get; set; }
    }
}
