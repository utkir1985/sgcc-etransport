using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Marketing.Services;

public interface ICatalogStationService
{
    Task<List<CatalogStationDto>> GetAllAsync(string? logisticsType = null, bool includeInactive = false);
    Task<CatalogStationDto> CreateAsync(CreateCatalogStationRequest request);
    Task<CatalogStationDto?> UpdateAsync(Guid id, UpdateCatalogStationRequest request);
    Task<bool> DeleteAsync(Guid id);
}

public class CatalogStationService(AppDbContext db) : ICatalogStationService
{
    public async Task<List<CatalogStationDto>> GetAllAsync(string? logisticsType = null, bool includeInactive = false)
    {
        try
        {
            if (!await db.CatalogStations.AnyAsync())
            {
                await SeedDefaultsAsync();
            }
        }
        catch
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "CatalogStations" (
                    "Id" uuid NOT NULL,
                    "Name" character varying(300) NOT NULL,
                    "Code" character varying(100) NULL,
                    "LogisticsType" character varying(20) NOT NULL,
                    "SortOrder" integer NOT NULL,
                    "IsActive" boolean NOT NULL,
                    "IsSystem" boolean NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_CatalogStations" PRIMARY KEY ("Id")
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogStations_Name"
                    ON "CatalogStations" ("Name");
                """);

            if (!await db.CatalogStations.AnyAsync())
            {
                await SeedDefaultsAsync();
            }
        }

        var query = db.CatalogStations.AsQueryable();
        if (!string.IsNullOrWhiteSpace(logisticsType))
        {
            query = query.Where(s => s.LogisticsType == logisticsType || s.LogisticsType == "Both");
        }
        if (!includeInactive)
        {
            query = query.Where(s => s.IsActive);
        }

        return await query
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.Name)
            .Select(s => ToDto(s))
            .ToListAsync();
    }

    public async Task<CatalogStationDto> CreateAsync(CreateCatalogStationRequest request)
    {
        var trimmedName = request.Name.Trim();
        var exists = await db.CatalogStations.AnyAsync(s => s.Name.ToLower() == trimmedName.ToLower());
        if (exists)
        {
            throw new ArgumentException("Bunday stansiya allaqachon mavjud");
        }

        var maxSort = await db.CatalogStations.MaxAsync(s => (int?)s.SortOrder) ?? 0;
        var station = new CatalogStation
        {
            Name = trimmedName,
            Code = request.Code?.Trim(),
            LogisticsType = request.LogisticsType ?? LogisticsTypes.Railway,
            SortOrder = request.SortOrder ?? (maxSort + 1),
            IsActive = true,
            IsSystem = false
        };

        db.CatalogStations.Add(station);
        await db.SaveChangesAsync();
        return ToDto(station);
    }

    public async Task<CatalogStationDto?> UpdateAsync(Guid id, UpdateCatalogStationRequest request)
    {
        var station = await db.CatalogStations.FirstOrDefaultAsync(s => s.Id == id);
        if (station is null) return null;

        var trimmedName = request.Name.Trim();
        var duplicate = await db.CatalogStations.AnyAsync(s => s.Id != id && s.Name.ToLower() == trimmedName.ToLower());
        if (duplicate)
        {
            throw new ArgumentException("Bunday nomdagi stansiya allaqachon mavjud");
        }

        station.Name = trimmedName;
        if (request.Code != null) station.Code = request.Code.Trim();
        if (request.LogisticsType != null) station.LogisticsType = request.LogisticsType;
        if (request.SortOrder.HasValue) station.SortOrder = request.SortOrder.Value;
        if (request.IsActive.HasValue) station.IsActive = request.IsActive.Value;

        await db.SaveChangesAsync();
        return ToDto(station);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var station = await db.CatalogStations.FirstOrDefaultAsync(s => s.Id == id);
        if (station is null) return false;

        db.CatalogStations.Remove(station);
        await db.SaveChangesAsync();
        return true;
    }

    private async Task SeedDefaultsAsync()
    {
        var defaultStations = new[]
        {
            ("Kengsoy stansiyasi", "ST-KENGSOY", LogisticsTypes.Railway),
            ("Pop stansiyasi", "ST-POP", LogisticsTypes.Railway),
            ("Marg'ilon stansiyasi", "ST-MARGILON", LogisticsTypes.Railway),
            ("Andijon-1", "ST-ANDIJON1", LogisticsTypes.Railway),
            ("Toshkent-Tovarniy", "ST-TASHKENT", LogisticsTypes.Railway),
        };

        var stations = defaultStations.Select((item, sort) => new CatalogStation
        {
            Name = item.Item1,
            Code = item.Item2,
            LogisticsType = item.Item3,
            SortOrder = sort,
            IsActive = true,
            IsSystem = true
        }).ToList();

        db.CatalogStations.AddRange(stations);
        await db.SaveChangesAsync();
    }

    private static CatalogStationDto ToDto(CatalogStation s) => new(
        s.Id, s.Name, s.Code, s.LogisticsType, s.SortOrder, s.IsActive, s.IsSystem, s.CreatedAt);
}
