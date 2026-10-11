using System.Globalization;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Data;

/// <summary>
/// Partiya (EmptyWagonArrival) ichida vagonlarni alohida birlik sifatida saqlash/sinxronlash.
/// Hududga bo‘lish yo‘q — faqat vagon bo‘yicha tara/yuklash/brutto/plomba.
/// </summary>
public static class EmptyWagonUnitSync
{
    public static List<string> ParseCsv(string? value) =>
        (value ?? "")
            .Split([',', ';', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

    public static Dictionary<string, string> ParseWeightMap(string? raw)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in ParseCsv(raw))
        {
            var m = System.Text.RegularExpressions.Regex.Match(part, @"^(.+?)\s*[:=]\s*(.+)$");
            if (m.Success)
                map[m.Groups[1].Value.Trim()] = m.Groups[2].Value.Trim().Replace(" tn", "", StringComparison.OrdinalIgnoreCase).Trim();
            else if (map.Count == 0 && !part.Contains(':') && !part.Contains('='))
                map["*"] = part.Replace(" tn", "", StringComparison.OrdinalIgnoreCase).Trim();
        }
        return map;
    }

    // Entry clearance is independent of weights received after the external weighing cycle.
    public static bool HasEntryApprovals(EmptyWagonArrival arrival) =>
        arrival.EntryPermitShiftApprovedAt.HasValue
        && arrival.EntryPermitPermitApprovedAt.HasValue
        && arrival.EntryPermitSecurityApprovedAt.HasValue;

    public static bool HasMeasuredNet(EmptyWagonUnit unit) =>
        TryParseWeight(unit.TareWeight, out var tare) && tare > 0
        && TryParseWeight(unit.GrossWeight, out var gross) && gross > tare;

    public static string? FormatNetto(string? tare, string? gross)
    {
        if (!TryParseWeight(tare, out var t) || !TryParseWeight(gross, out var g))
            return null;
        return (g - t).ToString("0.##", CultureInfo.InvariantCulture);
    }

    public static bool TryParseWeight(string? raw, out decimal value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var cleaned = raw.Replace(" tn", "", StringComparison.OrdinalIgnoreCase).Replace(',', '.').Trim();
        cleaned = new string(cleaned.Where(c => char.IsDigit(c) || c is '.' or '-').ToArray());
        return decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out value);
    }

    public static bool IsPostGross(string? status) =>
        status is EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Sealed;

    public static bool IsPlombaInstalled(EmptyWagonUnit unit) =>
        !string.IsNullOrWhiteSpace(unit.SealNumber);

    public static bool IsSealFullyConfirmed(EmptyWagonUnit unit) =>
        !string.IsNullOrWhiteSpace(unit.SealNumber)
        && unit.SealConfirmedByScaleAt != null
        && unit.SealConfirmedBySecurityAt != null;

    public static void TryCompleteSeal(EmptyWagonUnit unit)
    {
        if (string.IsNullOrWhiteSpace(unit.SealNumber)) return;
        if (unit.SealConfirmedByScaleAt != null
            && unit.SealConfirmedBySecurityAt != null)
        {
            unit.Status = EmptyWagonUnitStatuses.Sealed;
            unit.SealedAt ??= DateTime.UtcNow;
        }
        else
        {
            unit.Status = EmptyWagonUnitStatuses.SealPending;
        }
    }

    public static async Task EnsureUnitsAsync(AppDbContext db, EmptyWagonArrival arrival, bool save = false)
    {
        if (arrival.Units is null)
            await db.Entry(arrival).Collection(a => a.Units).LoadAsync();
        arrival.Units ??= [];

        var numbers = ParseCsv(
            string.IsNullOrWhiteSpace(arrival.VerifiedWagonNumbers)
                ? arrival.WagonNumbers
                : arrival.VerifiedWagonNumbers);

        if (numbers.Count == 0 && arrival.WagonCount > 0)
        {
            for (var i = 1; i <= arrival.WagonCount; i++)
                numbers.Add($"Vagon-{i}");
        }

        var rawCisterns = (arrival.CisternNumbers ?? "")
            .Split(',')
            .Select(x => x.Trim())
            .ToList();
        var tareMap = ParseWeightMap(arrival.TareWeight);
        var grossMap = ParseWeightMap(arrival.GrossWeight);
        var fallbackTare = tareMap.TryGetValue("*", out var ft) ? ft : "";

        var existing = arrival.Units.ToDictionary(u => u.WagonNumber, StringComparer.OrdinalIgnoreCase);
        var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < numbers.Count; i++)
        {
            var num = numbers[i];
            keep.Add(num);
            var singleProduct = SingleProductOnly(arrival.ProductType);
            var isNewUnit = false;
            if (!existing.TryGetValue(num, out var unit))
            {
                isNewUnit = true;
                unit = new EmptyWagonUnit
                {
                    EmptyWagonArrivalId = arrival.Id,
                    WagonNumber = num,
                    SortOrder = i,
                    ProductType = singleProduct,
                };
                arrival.Units.Add(unit);
                db.EmptyWagonUnits.Add(unit);
            }

            if (string.IsNullOrWhiteSpace(unit.ProductType) && !string.IsNullOrWhiteSpace(singleProduct))
                unit.ProductType = singleProduct;
            if (string.IsNullOrWhiteSpace(arrival.ProductType) && !string.IsNullOrWhiteSpace(unit.ProductType))
                arrival.ProductType = unit.ProductType;

            unit.SortOrder = i;
            // Legacy mirror faqat vagonlar soniga teng bo‘lganda pozitsion ishonchli.
            // Bo‘sh qiymatlar filtrlangan eski mirror konteynerlarni birinchi sisternalarga surib yubormasin.
            if (rawCisterns.Count == numbers.Count && i < rawCisterns.Count)
                unit.CisternNumber = rawCisterns[i];

            if (tareMap.TryGetValue(num, out var tare) || (!string.IsNullOrEmpty(fallbackTare) && string.IsNullOrWhiteSpace(unit.TareWeight)))
            {
                var t = tareMap.TryGetValue(num, out var tw) ? tw : fallbackTare;
                if (!string.IsNullOrWhiteSpace(t))
                    unit.TareWeight = t;
            }

            if (grossMap.TryGetValue(num, out var gross) && !string.IsNullOrWhiteSpace(gross))
                unit.GrossWeight = gross;

            // Statusni faqat yangi/bo‘sh unit uchun party stage dan taxmin qilamiz.
            if (isNewUnit || string.IsNullOrWhiteSpace(unit.Status))
            {
                unit.Status = InferStatusFromArrival(arrival, unit);
            }
            else
            {
                unit.Status = NormalizeStatus(unit);
                // Zavod amaliyotida tara kirishda olinmaydi — 1C chiqish siklida beradi.
                // Kirish ruxsatnomasi tasdiqlangan yoki estakadaga yo'naltirilgan partiyadagi AwaitingTare vagonlar
                // sun'iy bloklanib qolmasligi uchun yuklashga tayyor (Estakada) maqomiga suriladi.
                if (unit.Status == EmptyWagonUnitStatuses.AwaitingTare
                    && (arrival.Stage is "ReadyForEstakada" or "EstakadaPlaced" or "Loading" or "Loaded" or "ToRailwayScale" or "GrossWeighed" or "SealInstallation" or "Sealed" or "DocumentsIssued"
                        || (arrival.EntryPermitPermitApprovedAt != null && arrival.EntryPermitSecurityApprovedAt != null)))
                {
                    unit.Status = EmptyWagonUnitStatuses.Estakada;
                }
            }
        }

        foreach (var orphan in arrival.Units.Where(u => !keep.Contains(u.WagonNumber)).ToList())
        {
            arrival.Units.Remove(orphan);
            db.EmptyWagonUnits.Remove(orphan);
        }

        // Auto-fix legacy misassignments where container numbers were assigned to non-platform wagons.
        var platformUnitsWithoutCistern = arrival.Units.Where(u => u.WagonType == "platform" && string.IsNullOrWhiteSpace(u.CisternNumber)).ToList();
        if (platformUnitsWithoutCistern.Count > 0)
        {
            var misassigned = arrival.Units.Where(u => u.WagonType != "platform" && !string.IsNullOrWhiteSpace(u.CisternNumber)).ToList();
            for (var k = 0; k < misassigned.Count && k < platformUnitsWithoutCistern.Count; k++)
            {
                platformUnitsWithoutCistern[k].CisternNumber = misassigned[k].CisternNumber;
                misassigned[k].CisternNumber = "";
            }
        }

        var platformContainerValues = arrival.Units
            .Where(u => string.Equals(u.WagonType, "platform", StringComparison.OrdinalIgnoreCase))
            .SelectMany(u => (u.CisternNumber ?? "").Split(['|', ';', '·'], StringSplitOptions.RemoveEmptyEntries))
            .Select(x => x.Trim())
            .Where(x => x.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var unit in arrival.Units.Where(u => !string.Equals(u.WagonType, "platform", StringComparison.OrdinalIgnoreCase)))
        {
            var assigned = (unit.CisternNumber ?? "")
                .Split(['|', ';', '·'], StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .ToList();
            if (assigned.Count > 0 && assigned.All(platformContainerValues.Contains))
                unit.CisternNumber = string.Empty;
        }

        SyncMirrors(arrival);
        DerivePartyStage(arrival);

        if (save)
            await db.SaveChangesAsync();
    }

    private static string NormalizeStatus(EmptyWagonUnit unit)
    {
        if (unit.Status == EmptyWagonUnitStatuses.ToRailwayScale) return unit.Status;

        // Plomba / qaytarilgan / brutto tekshiruvi holatlarini saqlash
        if (unit.Status == EmptyWagonUnitStatuses.Sealed)
            return IsSealFullyConfirmed(unit) ? EmptyWagonUnitStatuses.Sealed : EmptyWagonUnitStatuses.SealPending;

        if (unit.Status is EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Returned
            or EmptyWagonUnitStatuses.GrossWeighed)
            return unit.Status;

        if (!string.IsNullOrWhiteSpace(unit.GrossWeight) || unit.GrossWeighedAt.HasValue)
            return EmptyWagonUnitStatuses.GrossWeighed;
        if ((unit.TareWeighedAt.HasValue || !string.IsNullOrWhiteSpace(unit.TareWeight))
            && unit.Status == EmptyWagonUnitStatuses.AwaitingTare)
            return EmptyWagonUnitStatuses.Tared;
        return unit.Status;
    }

    /// <summary>Tara og‘irligi 1C dan chiqishda keladi; kirish ruxsati berilgan yoki tekshiruvdan o'tgan bo'lsa yetarli.</summary>
    public static bool PassedTareCheck(EmptyWagonUnit unit) =>
        unit.Status != EmptyWagonUnitStatuses.AwaitingTare
        || unit.TareWeighedAt.HasValue
        || !string.IsNullOrWhiteSpace(unit.TareWeight)
        || unit.TareCheckedAt.HasValue
        || (unit.Arrival?.EntryPermitPermitApprovedAt != null && unit.Arrival?.EntryPermitSecurityApprovedAt != null);

    private static string InferStatusFromArrival(EmptyWagonArrival arrival, EmptyWagonUnit unit)
    {
        if (!string.IsNullOrWhiteSpace(unit.GrossWeight) || unit.GrossWeighedAt.HasValue)
        {
            return arrival.Stage switch
            {
                "Sealed" => EmptyWagonUnitStatuses.Sealed,
                "SealInstallation" => EmptyWagonUnitStatuses.SealPending,
                _ => EmptyWagonUnitStatuses.GrossWeighed,
            };
        }
        if (!string.IsNullOrWhiteSpace(unit.TareWeight) || unit.TareWeighedAt.HasValue)
        {
            return arrival.Stage switch
            {
                "Sealed" => EmptyWagonUnitStatuses.Sealed,
                "SealInstallation" => EmptyWagonUnitStatuses.SealPending,
                "GrossWeighed" => EmptyWagonUnitStatuses.GrossWeighed,
                "ToRailwayScale" or "Loaded" => EmptyWagonUnitStatuses.Loaded,
                "Loading" => EmptyWagonUnitStatuses.Loading,
                "EstakadaPlaced" => EmptyWagonUnitStatuses.Estakada,
                _ => EmptyWagonUnitStatuses.Tared,
            };
        }

        return arrival.Stage switch
        {
            "EstakadaPlaced" or "ReadyForEstakada" or "DocumentsIssued" => EmptyWagonUnitStatuses.Estakada,
            "Loading" => EmptyWagonUnitStatuses.Loading,
            "Loaded" or "ToRailwayScale" => EmptyWagonUnitStatuses.Loaded,
            "GrossWeighed" => EmptyWagonUnitStatuses.GrossWeighed,
            "SealInstallation" => EmptyWagonUnitStatuses.SealPending,
            "Sealed" => EmptyWagonUnitStatuses.Sealed,
            _ => (arrival.EntryPermitPermitApprovedAt != null && arrival.EntryPermitSecurityApprovedAt != null)
                ? EmptyWagonUnitStatuses.Estakada
                : EmptyWagonUnitStatuses.AwaitingTare,
        };
    }

    public static void SyncMirrors(EmptyWagonArrival arrival)
    {
        var ordered = arrival.Units.OrderBy(u => u.SortOrder).ThenBy(u => u.WagonNumber).ToList();
        arrival.WagonCount = ordered.Count;
        arrival.WagonNumbers = string.Join(", ", ordered.Select(u => u.WagonNumber));
        arrival.VerifiedWagonNumbers = arrival.WagonNumbers;
        // Pozitsiyani saqlaymiz: bo‘sh slotlar yo‘qolsa, keyingi sync konteynerlarni boshqa vagonga biriktiradi.
        arrival.CisternNumbers = string.Join(",", ordered.Select(u => u.CisternNumber ?? string.Empty));
        arrival.TareWeight = string.Join(", ",
            ordered.Where(u => !string.IsNullOrWhiteSpace(u.TareWeight))
                .Select(u => $"{u.WagonNumber}:{u.TareWeight}"));
        arrival.GrossWeight = string.Join(", ",
            ordered.Where(u => !string.IsNullOrWhiteSpace(u.GrossWeight))
                .Select(u => $"{u.WagonNumber}:{u.GrossWeight}"));
    }

    // Recover an active entry whose imported measurements advanced its stage
    // before the two real entry approvals. Never reopen issued/departed documents.
    public static void RestorePendingEntryStage(EmptyWagonArrival arrival)
    {
        if (arrival.EntryPermitShiftApprovedAt is null
            || (arrival.EntryPermitPermitApprovedAt is not null
                && arrival.EntryPermitSecurityApprovedAt is not null))
            return;

        if (arrival.Stage is "ReadyForEstakada" or "TareWeighing" or "EstakadaPlaced"
            or "Loading" or "Loaded" or "ToRailwayScale" or "GrossWeighed"
            or "SealInstallation" or "Sealed")
            arrival.Stage = "SecurityInspection";
    }

    public static void DerivePartyStage(EmptyWagonArrival arrival)
    {
        RestorePendingEntryStage(arrival);
        var units = arrival.Units;
        if (units.Count == 0) return;

        // Yuk xati jarayoni boshlanganidan keyin unit holatlari faqat yuklash
        // bosqichining dalili bo'lib qoladi. Masalan, barcha unitlar Sealed bo'lsa
        // ham partiya DocumentsIssued yoki Exited holatidan Sealed ga qaytmasin.
        if (arrival.Stage is "RegistryPrepared" or "PermitAndSecurityApproved"
            or "DocumentsIssued" or "Exited" or "Cancelled")
            return;

        // Erta bosqichlarni (ko‘rik/xabarnoma) saqlab qolamiz
        if (arrival.Stage is "Draft" or "RailwayInspected" or "KengsoyInspection"
            or "SecurityInspection")
            return;

        // Qaytarilgan vagonlar yuklash zanjirini bloklamasin
        var active = units.Where(u => u.Status != EmptyWagonUnitStatuses.Returned).ToList();
        if (active.Count == 0) return;

        // Barcha faol vagonlar zavoddan chiqib ketgan bo'lsa, partiya avtomatik Exited holatiga o'tadi
        if (active.All(u => u.ScaleExitedAt.HasValue))
        {
            arrival.Stage = "Exited";
            return;
        }

        // Qisman yuklash / qayta yuklash: yuklash guruhiga kirganlar (cycle) zanjirni yuritadi;
        // estakadada qolganlar yoki qayta yuklanayotgan vagonlar Loaded/Gross/Seal ni bloklamaydi.
        var cycle = active.Where(InLoadingCycle).ToList();
        var progressing = cycle.Count > 0 ? cycle : active;

        if (progressing.Any(u => u.Status == EmptyWagonUnitStatuses.ToRailwayScale))
        {
            arrival.Stage = "ToRailwayScale";
            return;
        }

        if (progressing.All(u => u.Status == EmptyWagonUnitStatuses.Sealed))
        {
            arrival.Stage = "Sealed";
            return;
        }

        if (progressing.Any(u => u.Status is EmptyWagonUnitStatuses.SealPending || u.Status is EmptyWagonUnitStatuses.Sealed || !string.IsNullOrWhiteSpace(u.SealNumber)))
        {
            arrival.Stage = "SealInstallation";
            return;
        }

        if (progressing.Any(u => u.Status == EmptyWagonUnitStatuses.GrossWeighed))
        {
            arrival.Stage = "GrossWeighed";
            return;
        }

        if (progressing.Any(u => u.Status is EmptyWagonUnitStatuses.Loaded))
        {
            arrival.Stage = "Loaded";
            return;
        }

        if (progressing.Any(u => u.Status == EmptyWagonUnitStatuses.Loading))
        {
            arrival.Stage = "Loading";
            return;
        }

        if (active.Any(u => u.Status is EmptyWagonUnitStatuses.Estakada))
        {
            arrival.Stage = "EstakadaPlaced";
            return;
        }

        if (active.Any(u => PassedTareCheck(u) || !string.IsNullOrWhiteSpace(u.TareWeight))
            || arrival.Stage is "ReadyForEstakada" or "TareWeighing" or "EstakadaPlaced" or "Loading" or "Loaded"
                or "GrossWeighed" or "ToRailwayScale" or "SealInstallation" or "Sealed")
        {
            // Tara tekshiruvi / og‘irlik stage ni orqaga tortmasin; legacy TareWeighing → ReadyForEstakada
            if (arrival.Stage is "TareWeighing" or "")
                arrival.Stage = "ReadyForEstakada";
            else if (arrival.Stage is not ("ReadyForEstakada" or "EstakadaPlaced" or "Loading" or "Loaded" or "GrossWeighed"
                    or "ToRailwayScale" or "SealInstallation" or "Sealed"))
                arrival.Stage = "ReadyForEstakada";
        }
    }

    /// <summary>
    /// Yuklash guruhiga kirgan yoki yuklash zanjirida ketayotgan vagon.
    /// Estakadada kutayotgan qoldiqlar (batch yo‘q) cycle emas.
    /// </summary>
    public static bool InLoadingCycle(EmptyWagonUnit unit) =>
        unit.ScaleExitedAt == null && (
        unit.Status is EmptyWagonUnitStatuses.Loading
            or EmptyWagonUnitStatuses.ToRailwayScale
            or EmptyWagonUnitStatuses.Loaded
            or EmptyWagonUnitStatuses.GrossWeighed
            or EmptyWagonUnitStatuses.SealPending
            or EmptyWagonUnitStatuses.Sealed
        || !string.IsNullOrWhiteSpace(unit.LoadingBatchNumber)
        || unit.LoadingStartedAt.HasValue
        || unit.LoadingCompletedAt.HasValue);

    public static void PromoteToEstakada(EmptyWagonArrival arrival)
    {
        var active = arrival.Units.Where(u =>
            u.Status is not (EmptyWagonUnitStatuses.Loading
                or EmptyWagonUnitStatuses.Loaded
                or EmptyWagonUnitStatuses.GrossWeighed
                or EmptyWagonUnitStatuses.SealPending
                or EmptyWagonUnitStatuses.Sealed
                or EmptyWagonUnitStatuses.Returned)).ToList();
        if (active.Count == 0)
            throw new InvalidOperationException("Yuklashga (estakadaga) yuborish uchun yaroqli vagon topilmadi.");

        foreach (var u in active)
        {
            u.Status = EmptyWagonUnitStatuses.Estakada;
            u.TareWeighedAt ??= DateTime.UtcNow;
        }

        arrival.Stage = "EstakadaPlaced";
        SyncMirrors(arrival);
    }

    /// <summary>
    /// Oxirgi faol vagon tara tekshiruvidan o‘tganda partiyani yuklash estakadasiga uzatadi.
    /// Qaytarilgan vagonlar hisobga olinmaydi. Keyingi bosqichga o'tgan partiyani orqaga qaytarmaydi.
    /// </summary>
    public static bool PromoteToEstakadaWhenTareComplete(EmptyWagonArrival arrival)
    {
        if (arrival.Stage is not ("ReadyForEstakada" or "TareWeighing")) return false;

        var active = arrival.Units
            .Where(u => u.Status != EmptyWagonUnitStatuses.Returned)
            .ToList();
        if (active.Count == 0) return false;

        foreach (var unit in active)
        {
            if (unit.Status == EmptyWagonUnitStatuses.AwaitingTare)
                unit.Status = EmptyWagonUnitStatuses.Estakada;
        }

        arrival.Stage = "EstakadaPlaced";
        SyncMirrors(arrival);
        return true;
    }

    public static EmptyWagonUnit? FindUnit(EmptyWagonArrival arrival, string wagonNumber) =>
        arrival.Units.FirstOrDefault(u =>
            string.Equals(u.WagonNumber, wagonNumber.Trim(), StringComparison.OrdinalIgnoreCase));

    public static EmptyWagonUnitDto ToUnitDto(EmptyWagonUnit u) =>
        new(
            u.Id,
            u.WagonNumber,
            u.CisternNumber,
            u.Status,
            u.TareWeight,
            u.GrossWeight,
            FormatNetto(u.TareWeight, u.GrossWeight),
            u.LoadingComment,
            u.LoadingStartedAt,
            u.LoadingCompletedAt,
            u.LoadingCompletedByName,
            u.TareWeighedAt,
            u.GrossWeighedAt,
            u.SortOrder,
            u.SealNumber,
            u.SealedAt,
            u.SealEnteredToUngAt,
            u.SealConfirmedByScaleAt,
            u.SealConfirmedByScaleName,
            u.SealConfirmedBySecurityAt,
            u.SealConfirmedBySecurityName,
            u.SealConfirmedByEconomistAt,
            u.SealConfirmedByEconomistName,
            u.ScaleExitedAt,
            u.WagonType,
            WagonOwnership.Normalize(u.Ownership),
            WagonIntakeLoadState.Normalize(u.IntakeLoadState),
            u.ProductType,
            u.PlatformTareWeight,
            u.ContainerTareWeights,
            u.LoadingBatchNumber,
            u.DefectActNumber,
            u.DefectActType,
            u.DefectActFileName,
            u.DefectActUploadedAt,
            u.DefectActUploadedByName,
            u.DefectActQrGlobalId ?? string.Empty,
            u.DefectActQrVerificationUrl ?? string.Empty,
            u.DefectActQrCodeBase64 ?? string.Empty,
            u.DefectActQrRegisteredAt,
            u.TareCheckedAt);

    public static void ApplyCisternNumbers(EmptyWagonArrival arrival, IReadOnlyList<string>? cisterns)
    {
        if (cisterns is null || cisterns.Count == 0 || arrival.Units is null) return;
        var units = arrival.Units.OrderBy(u => u.SortOrder).ThenBy(u => u.WagonNumber).ToList();
        for (var i = 0; i < units.Count && i < cisterns.Count; i++)
        {
            units[i].CisternNumber = cisterns[i]?.Trim() ?? "";
        }
    }

    /// <summary>Vagon turlari (|, yangi qator) — vagon tartibida.</summary>
    public static List<string> ParseWagonTypes(string? value) =>
        (value ?? "")
            .Split(['|', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

    public static void ApplyWagonTypes(EmptyWagonArrival arrival, IReadOnlyList<string>? types)
    {
        if (types is null || types.Count == 0 || arrival.Units is null) return;
        var units = arrival.Units.OrderBy(u => u.SortOrder).ThenBy(u => u.WagonNumber).ToList();
        for (var i = 0; i < units.Count && i < types.Count; i++)
        {
            if (!string.IsNullOrWhiteSpace(types[i]))
                units[i].WagonType = types[i].Trim();
        }
    }

    /// <summary>Tegishlilik (|, yangi qator) — vagon tartibida: majmua | tashqi.</summary>
    public static List<string> ParseOwnerships(string? value) =>
        (value ?? "")
            .Split(['|', '\n', '\r', ','], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => WagonOwnership.Normalize(x))
            .ToList();

    public static void ApplyOwnerships(EmptyWagonArrival arrival, IReadOnlyList<string>? ownerships)
    {
        if (ownerships is null || ownerships.Count == 0 || arrival.Units is null) return;
        var units = arrival.Units.OrderBy(u => u.SortOrder).ThenBy(u => u.WagonNumber).ToList();
        for (var i = 0; i < units.Count && i < ownerships.Count; i++)
        {
            if (!string.IsNullOrWhiteSpace(ownerships[i]))
                units[i].Ownership = WagonOwnership.Normalize(ownerships[i]);
        }
    }

    /// <summary>Kelish holati (|, yangi qator) — vagon tartibida: bosh | yukli | tola.</summary>
    public static List<string> ParseIntakeLoadStates(string? value) =>
        (value ?? "")
            .Split(['|', '\n', '\r', ','], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => WagonIntakeLoadState.Normalize(x))
            .ToList();

    public static void ApplyIntakeLoadStates(EmptyWagonArrival arrival, IReadOnlyList<string>? states)
    {
        if (states is null || states.Count == 0 || arrival.Units is null) return;
        var units = arrival.Units.OrderBy(u => u.SortOrder).ThenBy(u => u.WagonNumber).ToList();
        for (var i = 0; i < units.Count && i < states.Count; i++)
        {
            if (!string.IsNullOrWhiteSpace(states[i]))
                units[i].IntakeLoadState = WagonIntakeLoadState.Normalize(states[i]);
        }
    }

    /// <summary>
    /// Vagon uchun faqat bitta mahsulot ruxsat etiladi.
    /// Agar partiyaning umumiy xulosasida bir nechta mahsulot aralash bo'lsa (vergul bilan ajratilgan),
    /// u bitta vagonga berilmaydi.
    /// </summary>
    public static string SingleProductOnly(string? productType)
    {
        if (string.IsNullOrWhiteSpace(productType)) return string.Empty;
        var trimmed = productType.Trim();
        if (trimmed.Contains(',') || trimmed.Contains(';') || trimmed.Contains('\n'))
            return string.Empty;
        return trimmed;
    }
}
