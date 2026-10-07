using System.Text.Json;
using System.Text.RegularExpressions;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Marketing.Controllers;

public record MigrateLegacyNumbersResult(
    int OrdersUpdated,
    int ArrivalsUpdated,
    int RegistriesUpdated,
    int DefectActsUpdated,
    List<string> ChangeLogs
);

public class DocumentNumberingRuleDto
{
    public string DocumentType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
    public string PeriodFormat { get; set; } = "MMYY"; // "MMYY", "YYMM", "YYYY"
    public int SequenceDigits { get; set; } = 3;
    public string ResetPeriod { get; set; } = "Monthly"; // "Monthly", "Yearly"
    public string ExamplePreview { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsEditable { get; set; } = true;
}

public class UpdateDocumentNumberingRulesRequest
{
    public List<DocumentNumberingRuleDto> Rules { get; set; } = new();
}

[ApiController]
[Route("api/document-numbering")]
[Route("api/numbering-rules")]
[Authorize]
public class DocumentNumberingController(AppDbContext db) : ControllerBase
{
    private const string SettingKey = "DocumentNumberingRules";

    private static readonly List<DocumentNumberingRuleDto> DefaultRules = new()
    {
        new DocumentNumberingRuleDto
        {
            DocumentType = "InboundBatch",
            Title = "Kiritish partiyasi (Inbound)",
            Prefix = "IB",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Kengsoy temir yo‘l stansiyasidan korxonaga kirib kelgan vagonlar partiyasi kodi",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "EntryPermit",
            Title = "Kiritish xizmat xati (Permit)",
            Prefix = "ENP",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Vagonlarni majmuaga kiritish uchun rasmiylashtirilgan xizmat xati / ruxsatnoma",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "DefectAct",
            Title = "Dalolatnoma (Defect Act)",
            Prefix = "DFA",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Kirishda aniqlangan nuqson, ta‘mirtalablik yoki mahsulot yo‘qligi bo‘yicha rasmiy dalolatnoma",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "SealDefectAct",
            Title = "Plomba dalolatnomasi (Seal Defect Act)",
            Prefix = "PL",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Plomba shikastlanganligi, uzilganligi yoki almashtirilganligi to‘g‘risidagi elektron dalolatnoma",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "Waybill",
            Title = "Yuk xati (Waybill / Reyestr)",
            Prefix = "WB",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Yuklangan mahsulotlarni jo‘natish yuk xati va reyestri",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "Order_PE",
            Title = "Polietilen buyurtmasi",
            Prefix = "PE",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Polietilen mahsulotini temir yo‘l orqali yuklash oylik buyurtmasi",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "Order_LPG",
            Title = "Suyultirilgan gaz buyurtmasi",
            Prefix = "LPG",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Suyultirilgan uglevodorod gazi (SUG) sisterna vagonlari buyurtmasi",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "Order_SULF",
            Title = "Oltingugurt buyurtmasi",
            Prefix = "SULF",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Donador/tuyilgan oltingugurt mahsuloti buyurtmasi",
            IsEditable = true
        },
        new DocumentNumberingRuleDto
        {
            DocumentType = "Order_COND",
            Title = "Gaz kondensati buyurtmasi",
            Prefix = "COND",
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly",
            Description = "Barqarorlashtirilgan gaz kondensati yuklash buyurtmasi",
            IsEditable = true
        },
    };

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<DocumentNumberingRuleDto>>>> GetRules(CancellationToken ct)
    {
        var rules = await LoadRulesAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var rule in rules)
        {
            rule.ExamplePreview = FormatExample(rule.Prefix, rule.PeriodFormat, rule.SequenceDigits, now, 1);
        }

        return Ok(new ApiResponse<List<DocumentNumberingRuleDto>>(true, rules));
    }

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<List<DocumentNumberingRuleDto>>>> UpdateRules(
        [FromBody] UpdateDocumentNumberingRulesRequest request,
        CancellationToken ct)
    {
        if (request?.Rules == null || request.Rules.Count == 0)
            return BadRequest(new ApiResponse<List<DocumentNumberingRuleDto>>(false, null, "Qoidalar ro‘yxati bo‘sh bo‘lishi mumkin emas"));

        var cleaned = new List<DocumentNumberingRuleDto>();
        foreach (var rule in request.Rules)
        {
            var prefix = (rule.Prefix ?? "").Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(prefix) || prefix.Length < 1 || prefix.Length > 10)
                return BadRequest(new ApiResponse<List<DocumentNumberingRuleDto>>(false, null, $"Noto‘g‘ri prefiks: {rule.Prefix} ({rule.Title})"));

            var periodFormat = rule.PeriodFormat?.Trim().ToUpperInvariant() switch
            {
                "YYMM" => "YYMM",
                "YYYY" => "YYYY",
                _ => "MMYY"
            };

            var digits = rule.SequenceDigits is >= 2 and <= 6 ? rule.SequenceDigits : 3;

            cleaned.Add(new DocumentNumberingRuleDto
            {
                DocumentType = rule.DocumentType,
                Title = rule.Title,
                Prefix = prefix,
                PeriodFormat = periodFormat,
                SequenceDigits = digits,
                ResetPeriod = rule.ResetPeriod == "Yearly" ? "Yearly" : "Monthly",
                Description = rule.Description ?? "",
                IsEditable = rule.IsEditable
            });
        }

        var json = JsonSerializer.Serialize(cleaned);
        var setting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == SettingKey, ct);
        if (setting == null)
        {
            setting = new SystemSetting { Key = SettingKey, Value = json, UpdatedAt = DateTime.UtcNow };
            db.SystemSettings.Add(setting);
        }
        else
        {
            setting.Value = json;
            setting.UpdatedAt = DateTime.UtcNow;
        }

        // Agar buyurtma prefiksi o‘zgargan bo‘lsa, CatalogProducts ni ham sinxronlash
        await SyncCatalogProductPrefixesAsync(cleaned, ct);

        await db.SaveChangesAsync(ct);

        var now = DateTime.UtcNow;
        foreach (var r in cleaned)
            r.ExamplePreview = FormatExample(r.Prefix, r.PeriodFormat, r.SequenceDigits, now, 1);

        return Ok(new ApiResponse<List<DocumentNumberingRuleDto>>(true, cleaned, "Raqamlash qoidalari saqlandi"));
    }

    [HttpPost("migrate-legacy")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<MigrateLegacyNumbersResult>>> MigrateLegacyNumbers(CancellationToken ct)
    {
        var logs = new List<string>();
        int ordersUpdated = 0;
        int arrivalsUpdated = 0;
        int registriesUpdated = 0;
        int defectActsUpdated = 0;

        var rules = await LoadRulesAsync(ct);
        var ruleDict = rules.ToDictionary(r => r.DocumentType, StringComparer.OrdinalIgnoreCase);

        // 1. Migrate MonthlyOrders (e.g. LPG-00001, MO-T-2026-001 -> LPG-0926-001)
        var orders = await db.MonthlyOrders
            .Include(o => o.Lines)
            .OrderBy(o => o.CreatedAt)
            .ToListAsync(ct);

        var orderSeqByPrefix = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var ord in orders)
        {
            var m = Regex.Match(ord.OrderNumber, @"^([A-Z0-9]+)-(\d{4})-(\d+)$");
            if (m.Success)
            {
                var k = $"{m.Groups[1].Value}-{m.Groups[2].Value}";
                if (int.TryParse(m.Groups[3].Value, out var s))
                    orderSeqByPrefix[k] = Math.Max(orderSeqByPrefix.GetValueOrDefault(k, 0), s);
            }
        }

        var orderRenames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var ord in orders)
        {
            if (Regex.IsMatch(ord.OrderNumber, @"^[A-Z0-9]+-\d{4}-\d{3,}$"))
                continue; // Already standard

            string prefix = "PE";
            if (ord.ProductType.Contains("gaz", StringComparison.OrdinalIgnoreCase) || ord.ProductType.Contains("LPG", StringComparison.OrdinalIgnoreCase))
                prefix = ruleDict.GetValueOrDefault("Order_LPG")?.Prefix ?? "LPG";
            else if (ord.ProductType.Contains("Oltingugurt", StringComparison.OrdinalIgnoreCase) || ord.ProductType.Contains("SULF", StringComparison.OrdinalIgnoreCase))
                prefix = ruleDict.GetValueOrDefault("Order_SULF")?.Prefix ?? "SULF";
            else if (ord.ProductType.Contains("kondensat", StringComparison.OrdinalIgnoreCase) || ord.ProductType.Contains("COND", StringComparison.OrdinalIgnoreCase))
                prefix = ruleDict.GetValueOrDefault("Order_COND")?.Prefix ?? "COND";
            else
                prefix = ruleDict.GetValueOrDefault("Order_PE")?.Prefix ?? "PE";

            var date = ord.CreatedAt != default ? ord.CreatedAt : new DateTime(ord.Year, Math.Clamp(ord.Month, 1, 12), 1);
            var period = $"{date:MM}{date:yy}";
            var key = $"{prefix}-{period}";
            var nextSeq = orderSeqByPrefix.GetValueOrDefault(key, 0) + 1;
            orderSeqByPrefix[key] = nextSeq;

            var oldNumber = ord.OrderNumber;
            var newNumber = $"{prefix}-{period}-{nextSeq:D3}";
            ord.OrderNumber = newNumber;
            orderRenames[oldNumber] = newNumber;
            ordersUpdated++;
            logs.Add($"Buyurtma: {oldNumber} ➔ {newNumber} ({ord.ProductType})");
        }

        // 2. Migrate EmptyWagonArrivals (e.g. EWA-2026-001 -> IB-0926-001, PR-... -> ENP-0926-001)
        var arrivals = await db.EmptyWagonArrivals
            .OrderBy(a => a.ArrivalDate)
            .ToListAsync(ct);

        var arrivalSeqByPrefix = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var arr in arrivals)
        {
            var m = Regex.Match(arr.ArrivalNumber, @"^IB-(\d{4})-(\d+)$");
            if (m.Success)
            {
                var k = $"IB-{m.Groups[1].Value}";
                if (int.TryParse(m.Groups[2].Value, out var s))
                    arrivalSeqByPrefix[k] = Math.Max(arrivalSeqByPrefix.GetValueOrDefault(k, 0), s);
            }
        }

        var arrivalRenames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var arr in arrivals)
        {
            var isLegacyArrival = !Regex.IsMatch(arr.ArrivalNumber, @"^IB-\d{4}-\d{3,}$");
            var isLegacyPermit = string.IsNullOrWhiteSpace(arr.EntryPermitNumber) || !Regex.IsMatch(arr.EntryPermitNumber, @"^ENP-\d{4}-\d{3,}$");

            if (!isLegacyArrival && !isLegacyPermit) continue;

            var date = arr.ArrivalDate != default ? arr.ArrivalDate : arr.CreatedAt;
            var period = $"{date:MM}{date:yy}";
            var key = $"IB-{period}";

            if (isLegacyArrival)
            {
                var nextSeq = arrivalSeqByPrefix.GetValueOrDefault(key, 0) + 1;
                arrivalSeqByPrefix[key] = nextSeq;

                var oldNumber = arr.ArrivalNumber;
                var newNumber = $"IB-{period}-{nextSeq:D3}";
                arr.ArrivalNumber = newNumber;
                arrivalRenames[oldNumber] = newNumber;
                arrivalsUpdated++;
                logs.Add($"Partiya: {oldNumber} ➔ {newNumber}");
            }

            if (isLegacyPermit)
            {
                var oldPermit = arr.EntryPermitNumber;
                var seq = arrivalSeqByPrefix.GetValueOrDefault(key, 1);
                var newPermit = $"ENP-{period}-{seq:D3}";
                arr.EntryPermitNumber = newPermit;
                logs.Add($"Ruxsatnoma: {(string.IsNullOrWhiteSpace(oldPermit) ? "—" : oldPermit)} ➔ {newPermit}");
            }
        }

        // 3. Migrate LoadingRegistries (e.g. YX-EWA-2026-001 -> WB-0926-001)
        var registries = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)
            .OrderBy(r => r.PreparedAt)
            .ToListAsync(ct);

        var registrySeqByPrefix = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var reg in registries)
        {
            var m = Regex.Match(reg.RegistryNumber, @"^WB-(\d{4})-(\d+)$");
            if (m.Success)
            {
                var k = $"WB-{m.Groups[1].Value}";
                if (int.TryParse(m.Groups[2].Value, out var s))
                    registrySeqByPrefix[k] = Math.Max(registrySeqByPrefix.GetValueOrDefault(k, 0), s);
            }
        }

        foreach (var reg in registries)
        {
            if (!string.IsNullOrWhiteSpace(reg.OrderNumber) && orderRenames.TryGetValue(reg.OrderNumber, out var newOrdNum))
            {
                reg.OrderNumber = newOrdNum;
            }

            var isLegacyReg = !Regex.IsMatch(reg.RegistryNumber, @"^WB-\d{4}-\d{3,}$");
            if (!isLegacyReg) continue;

            var date = reg.PreparedAt != default ? reg.PreparedAt : DateTime.UtcNow;
            var period = $"{date:MM}{date:yy}";

            string newReg;
            if (reg.EmptyWagonArrival != null && reg.EmptyWagonArrival.ArrivalNumber.StartsWith("IB-"))
            {
                newReg = $"WB-{reg.EmptyWagonArrival.ArrivalNumber[3..]}";
            }
            else
            {
                var key = $"WB-{period}";
                var nextSeq = registrySeqByPrefix.GetValueOrDefault(key, 0) + 1;
                registrySeqByPrefix[key] = nextSeq;
                newReg = $"WB-{period}-{nextSeq:D3}";
            }

            var oldReg = reg.RegistryNumber;
            reg.RegistryNumber = newReg;
            registriesUpdated++;
            logs.Add($"Yuk xati: {oldReg} ➔ {newReg}");
        }

        // 4. Migrate Defect Acts
        var defectUnits = await db.EmptyWagonUnits
            .Where(u => !string.IsNullOrWhiteSpace(u.DefectActNumber) && !u.DefectActNumber.StartsWith("DFA-"))
            .ToListAsync(ct);

        int defectSeq = 1;
        foreach (var u in defectUnits)
        {
            var oldAct = u.DefectActNumber;
            var newAct = $"DFA-{DateTime.UtcNow:MMyy}-{defectSeq:D3}";
            defectSeq++;
            u.DefectActNumber = newAct;
            defectActsUpdated++;
            logs.Add($"Dalolatnoma ({u.WagonNumber}): {oldAct} ➔ {newAct}");
        }

        await db.SaveChangesAsync(ct);

        var result = new MigrateLegacyNumbersResult(
            ordersUpdated,
            arrivalsUpdated,
            registriesUpdated,
            defectActsUpdated,
            logs
        );

        return Ok(new ApiResponse<MigrateLegacyNumbersResult>(true, result, $"{logs.Count} ta eski yozuv yangi standartga o‘tkazildi"));
    }

    private async Task<List<DocumentNumberingRuleDto>> LoadRulesAsync(CancellationToken ct)
    {
        var setting = await db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == SettingKey, ct);
        if (setting == null || string.IsNullOrWhiteSpace(setting.Value))
            return DefaultRules.Select(CloneRule).ToList();

        try
        {
            var list = JsonSerializer.Deserialize<List<DocumentNumberingRuleDto>>(setting.Value);
            if (list == null || list.Count == 0) return DefaultRules.Select(CloneRule).ToList();

            // Agar default rules da yangi qo‘shilgan qoidalar bo‘lsa, ularni ham qo‘shib beramiz
            // OutboundBatch o'chirilgan (Yuk xati bilan birlashtirilgan)
            list = list.Where(x => !string.Equals(x.DocumentType, "OutboundBatch", StringComparison.OrdinalIgnoreCase)).ToList();
            var existingTypes = list.Select(x => x.DocumentType).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var def in DefaultRules)
            {
                if (!existingTypes.Contains(def.DocumentType))
                    list.Add(CloneRule(def));
            }

            return list;
        }
        catch
        {
            return DefaultRules.Select(CloneRule).ToList();
        }
    }

    private async Task SyncCatalogProductPrefixesAsync(List<DocumentNumberingRuleDto> rules, CancellationToken ct)
    {
        var peRule = rules.FirstOrDefault(r => r.DocumentType == "Order_PE");
        if (peRule != null)
        {
            var peProducts = await db.CatalogProducts.Where(p => p.Name.Contains("Polietilen") || p.OrderPrefix == "PE").ToListAsync(ct);
            foreach (var p in peProducts) p.OrderPrefix = peRule.Prefix;
        }

        var lpgRule = rules.FirstOrDefault(r => r.DocumentType == "Order_LPG");
        if (lpgRule != null)
        {
            var lpgProducts = await db.CatalogProducts.Where(p => p.Name.Contains("gaz") || p.Name.Contains("LPG") || p.OrderPrefix == "SG" || p.OrderPrefix == "LPG").ToListAsync(ct);
            foreach (var p in lpgProducts) p.OrderPrefix = lpgRule.Prefix;
        }

        var sulfRule = rules.FirstOrDefault(r => r.DocumentType == "Order_SULF");
        if (sulfRule != null)
        {
            var sulfProducts = await db.CatalogProducts.Where(p => p.Name.Contains("Oltingugurt") || p.OrderPrefix == "OL" || p.OrderPrefix == "SULF").ToListAsync(ct);
            foreach (var p in sulfProducts) p.OrderPrefix = sulfRule.Prefix;
        }

        var condRule = rules.FirstOrDefault(r => r.DocumentType == "Order_COND");
        if (condRule != null)
        {
            var condProducts = await db.CatalogProducts.Where(p => p.Name.Contains("kondensat") || p.OrderPrefix == "GK" || p.OrderPrefix == "COND").ToListAsync(ct);
            foreach (var p in condProducts) p.OrderPrefix = condRule.Prefix;
        }
    }

    private static string FormatExample(string prefix, string periodFormat, int digits, DateTime date, int sequence)
    {
        var period = periodFormat switch
        {
            "YYMM" => $"{date:yy}{date:MM}",
            "YYYY" => $"{date:yyyy}",
            _ => $"{date:MM}{date:yy}" // MMYY: default 0926
        };

        var seq = sequence.ToString($"D{Math.Clamp(digits, 2, 6)}");
        return $"{prefix}-{period}-{seq}";
    }

    private static DocumentNumberingRuleDto CloneRule(DocumentNumberingRuleDto r) => new()
    {
        DocumentType = r.DocumentType,
        Title = r.Title,
        Prefix = r.Prefix,
        PeriodFormat = r.PeriodFormat,
        SequenceDigits = r.SequenceDigits,
        ResetPeriod = r.ResetPeriod,
        Description = r.Description,
        IsEditable = r.IsEditable
    };
}
