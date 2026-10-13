using ETransport.Infrastructure.Identity;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace ETransport.Modules.Dispatching.Controllers;

[ApiController]
[Route("api/fleet-wagons")]
[Authorize]
public class FleetWagonsController(AppDbContext db) : ControllerBase
{
    private static readonly Regex DigitsOnly = new(@"\D", RegexOptions.Compiled);
    private const string DefaultWagonKind = "sisterna";
    private static readonly Dictionary<string, string> StationMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ахтачи"] = "Axtachi",
        ["axtachi"] = "Axtachi",
        ["актачи"] = "Axtachi",
        ["олтиарик"] = "Oltiariq",
        ["oltiarik"] = "Oltiariq",
        ["oltiariq"] = "Oltiariq",
        ["туракурган"] = "To'raqo'rg'on",
        ["turakurgan"] = "To'raqo'rg'on",
        ["to'raqo'rg'on"] = "To'raqo'rg'on",
        ["uychi"] = "Uychi",
        ["уйчи"] = "Uychi",
        ["xayrabod"] = "Xayrabod",
        ["хайрабод"] = "Xayrabod",
        ["шгкм"] = "ShGKM",
        ["shgkm"] = "ShGKM",
    };

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<CatalogFleetWagonDto>>>> GetAll(
        [FromQuery] string? ownership = null,
        [FromQuery] bool includeInactive = false)
    {
        var query = db.CatalogFleetWagons.AsQueryable();
        if (!includeInactive || !User.IsInRole(UserRoles.Admin))
            query = query.Where(w => w.IsActive);

        if (!string.IsNullOrWhiteSpace(ownership))
        {
            var norm = WagonOwnership.Normalize(ownership);
            query = query.Where(w => w.Ownership == norm);
        }

        var items = await query
            .OrderBy(w => w.WagonNumber)
            .ToListAsync();

        return Ok(new ApiResponse<List<CatalogFleetWagonDto>>(true, items.Select(ToDto).ToList()));
    }

    [HttpGet("lookup")]
    [RequirePermission("fleet-wagons.read")]
    public async Task<ActionResult<ApiResponse<FleetWagonLookupDto>>> Lookup([FromQuery] string number)
    {
        var normalized = NormalizeWagonNumber(number);
        if (normalized.Length != 8)
        {
            return Ok(new ApiResponse<FleetWagonLookupDto>(
                true,
                new FleetWagonLookupDto(normalized, null, false)));
        }

        var found = await db.CatalogFleetWagons.AsNoTracking()
            .FirstOrDefaultAsync(w => w.IsActive && w.WagonNumber == normalized);

        return Ok(new ApiResponse<FleetWagonLookupDto>(
            true,
            new FleetWagonLookupDto(
                normalized,
                found is null ? null : WagonOwnership.Normalize(found.Ownership),
                found is not null)));
    }

    [HttpPost]
    [RequirePermission("fleet-wagons.create")]
    public async Task<ActionResult<ApiResponse<CatalogFleetWagonDto>>> Create([FromBody] CreateCatalogFleetWagonRequest request)
    {
        try
        {
            var number = NormalizeWagonNumber(request.WagonNumber);
            if (number.Length != 8)
                return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, "Vagon raqami 8 xonali bo‘lishi kerak"));

            if (!WagonOwnership.IsValid(request.Ownership))
                return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, "Tegishlilik: majmua yoki tashqi"));

            var exists = await db.CatalogFleetWagons.AnyAsync(w => w.WagonNumber == number);
            if (exists)
                return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, "Bu vagon raqami parkda allaqachon bor"));

            var item = new CatalogFleetWagon
            {
                WagonNumber = number,
                Ownership = WagonOwnership.Normalize(request.Ownership),
                WagonKind = NormalizeWagonKind(request.WagonKind),
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                Serviceability = NormalizeServiceability(request.Serviceability),
                BuiltAt = ToUtc(request.BuiltAt),
                LastCapitalRepairAt = ToUtc(request.LastCapitalRepairAt),
                LastDepotRepairAt = ToUtc(request.LastDepotRepairAt),
                DaysUntilNextDepotRepair = request.DaysUntilNextDepotRepair,
                DestinationStation = NormalizeDestinationStation(request.DestinationStation),
                SentAt = ToUtc(request.SentAt),
                DaysInTransit = request.DaysInTransit,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.CatalogFleetWagons.Add(item);
            await db.SaveChangesAsync();
            return Ok(new ApiResponse<CatalogFleetWagonDto>(true, ToDto(item)));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("fleet-wagons.update")]
    public async Task<ActionResult<ApiResponse<CatalogFleetWagonDto>>> Update(
        Guid id,
        [FromBody] UpdateCatalogFleetWagonRequest request)
    {
        var item = await db.CatalogFleetWagons.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null)
            return NotFound(new ApiResponse<CatalogFleetWagonDto>(false, null, "Park yozuvi topilmadi"));

        var number = NormalizeWagonNumber(request.WagonNumber);
        if (number.Length != 8)
            return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, "Vagon raqami 8 xonali bo‘lishi kerak"));

        if (!WagonOwnership.IsValid(request.Ownership))
            return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, "Tegishlilik: majmua yoki tashqi"));

        var duplicate = await db.CatalogFleetWagons.AnyAsync(w => w.Id != id && w.WagonNumber == number);
        if (duplicate)
            return BadRequest(new ApiResponse<CatalogFleetWagonDto>(false, null, "Bu vagon raqami parkda allaqachon bor"));

        ApplyFields(item, request);
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<CatalogFleetWagonDto>(true, ToDto(item)));
    }

    [HttpPost("import")]
    [RequirePermission("fleet-wagons.create")]
    public async Task<ActionResult<ApiResponse<FleetWagonImportResultDto>>> Import([FromBody] FleetWagonImportRequest request)
    {
        if (request.Rows is null || request.Rows.Count == 0)
            return BadRequest(new ApiResponse<FleetWagonImportResultDto>(false, null, "Import qatorlari bo‘sh"));

        var defaultOwnership = WagonOwnership.Normalize(request.DefaultOwnership);
        var created = 0;
        var updated = 0;
        var skipped = 0;
        var errors = new List<string>();

        foreach (var (row, index) in request.Rows.Select((r, i) => (r, i + 1)))
        {
            var number = NormalizeWagonNumber(row.WagonNumber);
            if (number.Length != 8)
            {
                skipped++;
                errors.Add($"{index}-qator: vagon raqami noto‘g‘ri ({row.WagonNumber})");
                continue;
            }

            var ownership = string.IsNullOrWhiteSpace(row.Ownership)
                ? defaultOwnership
                : WagonOwnership.Normalize(row.Ownership);

            var existing = await db.CatalogFleetWagons.FirstOrDefaultAsync(w => w.WagonNumber == number);
            if (existing is null)
            {
                db.CatalogFleetWagons.Add(new CatalogFleetWagon
                {
                    WagonNumber = number,
                    Ownership = ownership,
                    WagonKind = DefaultWagonKind,
                    Notes = string.IsNullOrWhiteSpace(row.Notes) ? null : row.Notes.Trim(),
                    BuiltAt = ToUtc(row.BuiltAt),
                    LastCapitalRepairAt = ToUtc(row.LastCapitalRepairAt),
                    LastDepotRepairAt = ToUtc(row.LastDepotRepairAt),
                    DaysUntilNextDepotRepair = row.DaysUntilNextDepotRepair,
                    DestinationStation = NormalizeDestinationStation(row.DestinationStation),
                    SentAt = ToUtc(row.SentAt),
                    DaysInTransit = row.DaysInTransit,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
                created++;
            }
            else
            {
                existing.Ownership = ownership;
                existing.WagonKind = NormalizeWagonKind(existing.WagonKind);
                if (!string.IsNullOrWhiteSpace(row.Notes)) existing.Notes = row.Notes.Trim();
                if (row.BuiltAt.HasValue) existing.BuiltAt = ToUtc(row.BuiltAt);
                if (row.LastCapitalRepairAt.HasValue) existing.LastCapitalRepairAt = ToUtc(row.LastCapitalRepairAt);
                // Depo / qolgan muddat / manzil — har importda yangilanadi (ustunlar to‘g‘rilanganda)
                if (row.LastDepotRepairAt.HasValue) existing.LastDepotRepairAt = ToUtc(row.LastDepotRepairAt);
                if (row.DaysUntilNextDepotRepair.HasValue) existing.DaysUntilNextDepotRepair = row.DaysUntilNextDepotRepair;
                if (!string.IsNullOrWhiteSpace(row.DestinationStation))
                    existing.DestinationStation = NormalizeDestinationStation(row.DestinationStation);
                if (row.SentAt.HasValue) existing.SentAt = ToUtc(row.SentAt);
                if (row.DaysInTransit.HasValue) existing.DaysInTransit = row.DaysInTransit;
                existing.IsActive = true;
                existing.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<FleetWagonImportResultDto>(
            true,
            new FleetWagonImportResultDto(created, updated, skipped, errors)));
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("fleet-wagons.delete")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var item = await db.CatalogFleetWagons.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null)
            return NotFound(new ApiResponse<object>(false, null, "Park yozuvi topilmadi"));

        db.CatalogFleetWagons.Remove(item);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, null, "O‘chirildi"));
    }

    public const string OnSiteStation = CatalogParkLocationSync.OnSiteStation;

    /// <summary>Intake/inspection dan keyin parkni yangilash (learn) + SHGKM (majmuada).</summary>
    public static Task UpsertFleetFromIntakeAsync(
        AppDbContext db,
        IReadOnlyList<string> wagonNumbers,
        IReadOnlyList<string> ownerships,
        IReadOnlyList<string>? wagonKinds = null) =>
        CatalogParkLocationSync.UpsertWagonsOnSiteAsync(db, wagonNumbers, ownerships, wagonKinds, DefaultWagonKind);

    /// <summary>Kengsoygacha chiqish — majmuadan chiqdi (SHGKM emas).</summary>
    public static Task MarkFleetDepartedAsync(AppDbContext db, IEnumerable<string> wagonNumbers) =>
        CatalogParkLocationSync.MarkWagonsDepartedAsync(db, wagonNumbers);

    private static void ApplyFields(CatalogFleetWagon item, UpdateCatalogFleetWagonRequest request)
    {
        item.WagonNumber = NormalizeWagonNumber(request.WagonNumber);
        item.Ownership = WagonOwnership.Normalize(request.Ownership);
        item.WagonKind = NormalizeWagonKind(request.WagonKind);
        item.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        item.Serviceability = NormalizeServiceability(request.Serviceability);
        item.IsActive = request.IsActive;
        item.BuiltAt = ToUtc(request.BuiltAt);
        item.LastCapitalRepairAt = ToUtc(request.LastCapitalRepairAt);
        item.LastDepotRepairAt = ToUtc(request.LastDepotRepairAt);
        item.DaysUntilNextDepotRepair = request.DaysUntilNextDepotRepair;
        item.DestinationStation = NormalizeDestinationStation(request.DestinationStation);
        item.SentAt = ToUtc(request.SentAt);
        item.DaysInTransit = request.DaysInTransit;
    }

    private static CatalogFleetWagonDto ToDto(CatalogFleetWagon w) => new(
        w.Id,
        w.WagonNumber,
        WagonOwnership.Normalize(w.Ownership),
        NormalizeWagonKind(w.WagonKind),
        w.IsActive,
        w.Notes,
        NormalizeServiceability(w.Serviceability),
        w.BuiltAt,
        w.LastCapitalRepairAt,
        w.LastDepotRepairAt,
        w.DaysUntilNextDepotRepair,
        w.DestinationStation,
        w.SentAt,
        w.DaysInTransit,
        w.CreatedAt,
        w.UpdatedAt);

    private static DateTime? ToUtc(DateTime? value) =>
        value.HasValue ? DateTime.SpecifyKind(value.Value.Date, DateTimeKind.Utc) : null;

    private static string NormalizeWagonKind(string? value) =>
        string.IsNullOrWhiteSpace(value) ? DefaultWagonKind : value.Trim().ToLowerInvariant();

    private static string? NormalizeServiceability(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var key = value.Trim().ToLowerInvariant();
        return key is "yaroqli" or "eslatma" or "yaroqsiz" ? key : null;
    }

    private static string? NormalizeDestinationStation(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var raw = value.Trim();
        var key = raw.ToLowerInvariant();
        if (StationMap.TryGetValue(key, out var mapped)) return mapped;
        // Simple title-case fallback for latin names
        var words = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => char.ToUpperInvariant(w[0]) + w[1..].ToLowerInvariant());
        return string.Join(" ", words);
    }

    public static string NormalizeWagonNumber(string? value) =>
        DigitsOnly.Replace(value ?? "", "");
}
