using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace ETransport.Modules.Dispatching.Controllers;

[ApiController]
[Route("api/containers")]
[Authorize]
public class ContainersController(AppDbContext db) : ControllerBase
{
    private static readonly Regex MultiSpace = new(@"\s+", RegexOptions.Compiled);
    private static readonly Dictionary<string, string> StationMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["шгкм"] = "ShGKM",
        ["shgkm"] = "ShGKM",
        ["poletilen"] = "POLETILEN",
        ["полиэтилен"] = "POLETILEN",
        ["ахтачи"] = "Axtachi",
        ["axtachi"] = "Axtachi",
        ["олтиарик"] = "Oltiariq",
        ["oltiariq"] = "Oltiariq",
        ["туракурган"] = "To'raqo'rg'on",
        ["to'raqo'rg'on"] = "To'raqo'rg'on",
        ["uychi"] = "Uychi",
        ["уйчи"] = "Uychi",
        ["xayrabod"] = "Xayrabod",
        ["хайрабод"] = "Xayrabod",
    };

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<CatalogContainerDto>>>> GetAll(
        [FromQuery] bool includeInactive = false)
    {
        var query = db.CatalogContainers.AsQueryable();
        if (!includeInactive || !User.IsInRole("Admin"))
            query = query.Where(c => c.IsActive);

        var items = await query
            .OrderBy(c => c.ContainerNumber)
            .ToListAsync();

        return Ok(new ApiResponse<List<CatalogContainerDto>>(true, items.Select(ToDto).ToList()));
    }

    [HttpGet("lookup")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> Lookup([FromQuery] string number)
    {
        var normalized = NormalizeContainerNumber(number);
        if (string.IsNullOrWhiteSpace(normalized))
            return Ok(new ApiResponse<object>(true, new { containerNumber = normalized, found = false }));

        var found = await db.CatalogContainers.AsNoTracking()
            .FirstOrDefaultAsync(c => c.IsActive && c.ContainerNumber == normalized);

        return Ok(new ApiResponse<object>(true, new
        {
            containerNumber = normalized,
            found = found is not null,
            item = found is null ? null : ToDto(found),
        }));
    }

    [HttpPost]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<CatalogContainerDto>>> Create([FromBody] CreateCatalogContainerRequest request)
    {
        try
        {
            var number = NormalizeContainerNumber(request.ContainerNumber);
            if (string.IsNullOrWhiteSpace(number))
                return BadRequest(new ApiResponse<CatalogContainerDto>(false, null, "Konteyner raqamini kiriting"));

            var exists = await db.CatalogContainers.AnyAsync(c => c.ContainerNumber == number);
            if (exists)
                return BadRequest(new ApiResponse<CatalogContainerDto>(false, null, "Bu konteyner allaqachon bor"));

            var item = new CatalogContainer
            {
                ContainerNumber = number,
                BuiltAt = ToUtc(request.BuiltAt),
                NextInspectionAt = ToUtc(request.NextInspectionAt),
                DaysUntilNextInspection = request.DaysUntilNextInspection,
                DestinationStation = NormalizeDestinationStation(request.DestinationStation),
                SentAt = ToUtc(request.SentAt),
                DaysInTransit = request.DaysInTransit,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                Serviceability = NormalizeServiceability(request.Serviceability),
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.CatalogContainers.Add(item);
            await db.SaveChangesAsync();
            return Ok(new ApiResponse<CatalogContainerDto>(true, ToDto(item)));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<CatalogContainerDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<CatalogContainerDto>>> Update(
        Guid id,
        [FromBody] UpdateCatalogContainerRequest request)
    {
        var item = await db.CatalogContainers.FirstOrDefaultAsync(c => c.Id == id);
        if (item is null)
            return NotFound(new ApiResponse<CatalogContainerDto>(false, null, "Konteyner topilmadi"));

        var number = NormalizeContainerNumber(request.ContainerNumber);
        if (string.IsNullOrWhiteSpace(number))
            return BadRequest(new ApiResponse<CatalogContainerDto>(false, null, "Konteyner raqamini kiriting"));

        var duplicate = await db.CatalogContainers.AnyAsync(c => c.Id != id && c.ContainerNumber == number);
        if (duplicate)
            return BadRequest(new ApiResponse<CatalogContainerDto>(false, null, "Bu konteyner allaqachon bor"));

        item.ContainerNumber = number;
        item.BuiltAt = ToUtc(request.BuiltAt);
        item.NextInspectionAt = ToUtc(request.NextInspectionAt);
        item.DaysUntilNextInspection = request.DaysUntilNextInspection;
        item.DestinationStation = NormalizeDestinationStation(request.DestinationStation);
        item.SentAt = ToUtc(request.SentAt);
        item.DaysInTransit = request.DaysInTransit;
        item.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        item.Serviceability = NormalizeServiceability(request.Serviceability);
        item.IsActive = request.IsActive;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<CatalogContainerDto>(true, ToDto(item)));
    }

    [HttpPost("import")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<ContainerImportResultDto>>> Import([FromBody] ContainerImportRequest request)
    {
        if (request.Rows is null || request.Rows.Count == 0)
            return BadRequest(new ApiResponse<ContainerImportResultDto>(false, null, "Import qatorlari bo‘sh"));

        var created = 0;
        var updated = 0;
        var skipped = 0;
        var errors = new List<string>();

        foreach (var (row, index) in request.Rows.Select((r, i) => (r, i + 1)))
        {
            var number = NormalizeContainerNumber(row.ContainerNumber);
            if (string.IsNullOrWhiteSpace(number))
            {
                skipped++;
                errors.Add($"{index}-qator: konteyner raqami bo‘sh");
                continue;
            }

            var existing = await db.CatalogContainers.FirstOrDefaultAsync(c => c.ContainerNumber == number);
            if (existing is null)
            {
                db.CatalogContainers.Add(new CatalogContainer
                {
                    ContainerNumber = number,
                    BuiltAt = ToUtc(row.BuiltAt),
                    NextInspectionAt = ToUtc(row.NextInspectionAt),
                    DaysUntilNextInspection = row.DaysUntilNextInspection,
                    DestinationStation = NormalizeDestinationStation(row.DestinationStation),
                    SentAt = ToUtc(row.SentAt),
                    DaysInTransit = row.DaysInTransit,
                    Notes = string.IsNullOrWhiteSpace(row.Notes) ? null : row.Notes.Trim(),
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
                created++;
            }
            else
            {
                if (row.BuiltAt.HasValue) existing.BuiltAt = ToUtc(row.BuiltAt);
                if (row.NextInspectionAt.HasValue) existing.NextInspectionAt = ToUtc(row.NextInspectionAt);
                if (row.DaysUntilNextInspection.HasValue)
                    existing.DaysUntilNextInspection = row.DaysUntilNextInspection;
                if (!string.IsNullOrWhiteSpace(row.DestinationStation))
                    existing.DestinationStation = NormalizeDestinationStation(row.DestinationStation);
                if (row.SentAt.HasValue) existing.SentAt = ToUtc(row.SentAt);
                if (row.DaysInTransit.HasValue) existing.DaysInTransit = row.DaysInTransit;
                if (!string.IsNullOrWhiteSpace(row.Notes)) existing.Notes = row.Notes.Trim();
                existing.IsActive = true;
                existing.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<ContainerImportResultDto>(
            true,
            new ContainerImportResultDto(created, updated, skipped, errors)));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Railway,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var item = await db.CatalogContainers.FirstOrDefaultAsync(c => c.Id == id);
        if (item is null)
            return NotFound(new ApiResponse<object>(false, null, "Konteyner topilmadi"));

        db.CatalogContainers.Remove(item);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, null, "O‘chirildi"));
    }

    private static CatalogContainerDto ToDto(CatalogContainer c) => new(
        c.Id,
        c.ContainerNumber,
        c.BuiltAt,
        c.NextInspectionAt,
        c.DaysUntilNextInspection,
        c.DestinationStation,
        c.SentAt,
        c.DaysInTransit,
        c.Notes,
        NormalizeServiceability(c.Serviceability),
        c.IsActive,
        c.CreatedAt,
        c.UpdatedAt);

    private static DateTime? ToUtc(DateTime? value) =>
        value.HasValue ? DateTime.SpecifyKind(value.Value.Date, DateTimeKind.Utc) : null;

    private static string? NormalizeServiceability(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var key = value.Trim().ToLowerInvariant();
        return key is "yaroqli" or "eslatma" or "yaroqsiz" ? key : null;
    }

    private static string NormalizeContainerNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return MultiSpace.Replace(value.Trim().ToUpperInvariant(), " ");
    }

    private static string? NormalizeDestinationStation(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var raw = value.Trim();
        var key = raw.ToLowerInvariant();
        if (StationMap.TryGetValue(key, out var mapped)) return mapped;
        return raw.ToUpperInvariant();
    }
}
