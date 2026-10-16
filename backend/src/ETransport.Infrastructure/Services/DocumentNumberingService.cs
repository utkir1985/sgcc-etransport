using System.Text.Json;
using ETransport.Core.Entities;
using ETransport.Core.Interfaces;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Services;

public class DocumentNumberingRuleModel
{
    public string DocumentType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
    public string PeriodFormat { get; set; } = "MMYY";
    public int SequenceDigits { get; set; } = 3;
    public string ResetPeriod { get; set; } = "Monthly";
    public string Description { get; set; } = string.Empty;
    public bool IsEditable { get; set; } = true;
}

public class DocumentNumberingService(AppDbContext db) : IDocumentNumberingService
{
    private const string SettingKey = "DocumentNumberingRules";

    private static readonly Dictionary<string, DocumentNumberingRuleModel> Defaults = new(StringComparer.OrdinalIgnoreCase)
    {
        ["InboundBatch"] = new() { DocumentType = "InboundBatch", Prefix = "IB", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["DefectAct"] = new() { DocumentType = "DefectAct", Prefix = "DFA", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["SealDefectAct"] = new() { DocumentType = "SealDefectAct", Prefix = "PL", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["Waybill"] = new() { DocumentType = "Waybill", Prefix = "WB", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["Order_PE"] = new() { DocumentType = "Order_PE", Prefix = "PE", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["Order_LPG"] = new() { DocumentType = "Order_LPG", Prefix = "LPG", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["Order_SULF"] = new() { DocumentType = "Order_SULF", Prefix = "SULF", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
        ["Order_COND"] = new() { DocumentType = "Order_COND", Prefix = "COND", PeriodFormat = "MMYY", SequenceDigits = 3, ResetPeriod = "Monthly" },
    };

    private async Task<DocumentNumberingRuleModel> GetRuleAsync(string docType, CancellationToken ct = default)
    {
        try
        {
            var setting = await db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == SettingKey, ct);
            if (setting != null && !string.IsNullOrWhiteSpace(setting.Value))
            {
                var rules = JsonSerializer.Deserialize<List<DocumentNumberingRuleModel>>(setting.Value);
                var match = rules?.FirstOrDefault(r => string.Equals(r.DocumentType, docType, StringComparison.OrdinalIgnoreCase));
                if (match != null && !string.IsNullOrWhiteSpace(match.Prefix))
                {
                    return match;
                }
            }
        }
        catch
        {
            // Fallback to default
        }

        if (Defaults.TryGetValue(docType, out var def)) return def;
        return new DocumentNumberingRuleModel
        {
            DocumentType = docType,
            Prefix = docType[..Math.Min(4, docType.Length)].ToUpperInvariant(),
            PeriodFormat = "MMYY",
            SequenceDigits = 3,
            ResetPeriod = "Monthly"
        };
    }

    private static string FormatPeriod(string format, DateTime date)
    {
        return format?.ToUpperInvariant() switch
        {
            "YYMM" => $"{date:yy}{date:MM}",
            "YYYY" => $"{date:yyyy}",
            _ => $"{date:MM}{date:yy}" // MMYY
        };
    }

    public async Task<string> GenerateInboundBatchNumberAsync(CancellationToken ct = default)
    {
        var rule = await GetRuleAsync("InboundBatch", ct);
        var now = DateTime.UtcNow;
        var period = FormatPeriod(rule.PeriodFormat, now);
        var prefix = $"{rule.Prefix.Trim().ToUpperInvariant()}-{period}-";

        var existing = await db.EmptyWagonArrivals.AsNoTracking()
            .Where(a => a.ArrivalNumber.StartsWith(prefix))
            .Select(a => a.ArrivalNumber)
            .ToListAsync(ct);

        var maxSeq = existing
            .Select(num => ParseSequence(num, prefix))
            .DefaultIfEmpty(0)
            .Max();

        var digits = Math.Clamp(rule.SequenceDigits, 2, 6);
        return $"{prefix}{(maxSeq + 1).ToString($"D{digits}")}";
    }

    public async Task<string> GenerateOutboundBatchNumberAsync(CancellationToken ct = default)
    {
        // Chiqarish partiyasi va Yuk xati bitta narsa bo'lgani sababli to'g'ridan-to'g'ri Yuk xati raqami (WB) shakllantiriladi
        return await GenerateWaybillNumberAsync(null, ct);
    }

    public async Task<string> GenerateDefectActNumberAsync(CancellationToken ct = default)
    {
        var rule = await GetRuleAsync("DefectAct", ct);
        var now = DateTime.UtcNow;
        var period = FormatPeriod(rule.PeriodFormat, now);
        var prefix = $"{rule.Prefix.Trim().ToUpperInvariant()}-{period}-";

        var existing = await db.EmptyWagonUnits.AsNoTracking()
            .Where(u => u.DefectActNumber.StartsWith(prefix))
            .Select(u => u.DefectActNumber)
            .ToListAsync(ct);

        var maxSeq = existing
            .Select(num => ParseSequence(num, prefix))
            .DefaultIfEmpty(0)
            .Max();

        var digits = Math.Clamp(rule.SequenceDigits, 2, 6);
        return $"{prefix}{(maxSeq + 1).ToString($"D{digits}")}";
    }

    public async Task<string> GenerateSealDefectActNumberAsync(CancellationToken ct = default)
    {
        var rule = await GetRuleAsync("SealDefectAct", ct);
        var now = DateTime.UtcNow;
        var period = FormatPeriod(rule.PeriodFormat, now);
        var prefix = $"{rule.Prefix.Trim().ToUpperInvariant()}-{period}-";

        var existing = await db.EmptyWagonUnits.AsNoTracking()
            .Where(u => u.DefectActNumber.StartsWith(prefix))
            .Select(u => u.DefectActNumber)
            .ToListAsync(ct);

        var maxSeq = existing
            .Select(num => ParseSequence(num, prefix))
            .DefaultIfEmpty(0)
            .Max();

        var digits = Math.Clamp(rule.SequenceDigits, 2, 6);
        return $"{prefix}{(maxSeq + 1).ToString($"D{digits}")}";
    }

    public async Task<string> GenerateWaybillNumberAsync(string? basePartyNumber = null, CancellationToken ct = default)
    {
        var rule = await GetRuleAsync("Waybill", ct);
        var now = DateTime.UtcNow;
        var period = FormatPeriod(rule.PeriodFormat, now);
        var prefix = $"{rule.Prefix.Trim().ToUpperInvariant()}-{period}-";

        var existing = await db.LoadingRegistries.AsNoTracking()
            .Where(r => r.RegistryNumber.StartsWith(prefix))
            .Select(r => r.RegistryNumber)
            .ToListAsync(ct);

        var maxSeq = existing
            .Select(num => ParseSequence(num, prefix))
            .DefaultIfEmpty(0)
            .Max();

        var digits = Math.Clamp(rule.SequenceDigits, 2, 6);
        return $"{prefix}{(maxSeq + 1).ToString($"D{digits}")}";
    }

    public async Task<string> GenerateOrderNumberAsync(string logisticsType, string productType, CancellationToken ct = default)
    {
        // 1. CatalogProducts dan prefiksni tekshiramiz
        var catalogPrefix = await db.CatalogProducts.AsNoTracking()
            .Where(p => p.LogisticsType == logisticsType && p.Name == productType && p.IsActive)
            .Select(p => p.OrderPrefix)
            .FirstOrDefaultAsync(ct);

        var docType = "Order_PE";
        if (productType.Contains("gaz", StringComparison.OrdinalIgnoreCase) || productType.Contains("LPG", StringComparison.OrdinalIgnoreCase))
            docType = "Order_LPG";
        else if (productType.Contains("Oltingugurt", StringComparison.OrdinalIgnoreCase) || productType.Contains("SULF", StringComparison.OrdinalIgnoreCase))
            docType = "Order_SULF";
        else if (productType.Contains("kondensat", StringComparison.OrdinalIgnoreCase) || productType.Contains("COND", StringComparison.OrdinalIgnoreCase))
            docType = "Order_COND";

        var rule = await GetRuleAsync(docType, ct);
        var effectivePrefix = !string.IsNullOrWhiteSpace(catalogPrefix)
            ? catalogPrefix.Trim().ToUpperInvariant()
            : rule.Prefix.Trim().ToUpperInvariant();

        var now = DateTime.UtcNow;
        var period = FormatPeriod(rule.PeriodFormat, now);
        var monthlyPrefix = $"{effectivePrefix}-{period}-";

        var existing = await db.MonthlyOrders.AsNoTracking()
            .Where(o => o.OrderNumber.StartsWith(monthlyPrefix))
            .Select(o => o.OrderNumber)
            .ToListAsync(ct);

        var maxSeq = existing
            .Select(num => ParseSequence(num, monthlyPrefix))
            .DefaultIfEmpty(0)
            .Max();

        var digits = Math.Clamp(rule.SequenceDigits, 2, 6);
        return $"{monthlyPrefix}{(maxSeq + 1).ToString($"D{digits}")}";
    }

    private static int ParseSequence(string value, string prefix)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.StartsWith(prefix, StringComparison.Ordinal))
            return 0;

        var remainder = value[prefix.Length..];
        var splitIndex = remainder.IndexOf('-');
        if (splitIndex >= 0) remainder = remainder[..splitIndex];

        return int.TryParse(remainder, out var seq) ? seq : 0;
    }
}
