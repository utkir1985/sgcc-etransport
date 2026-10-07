using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Marketing.Services;

public interface ICatalogWagonTypeService
{
    Task<List<CatalogWagonTypeDto>> GetAllAsync(bool includeInactive = false);
    Task<CatalogWagonTypeDto> CreateAsync(CreateCatalogWagonTypeRequest request);
    Task<CatalogWagonTypeDto?> UpdateAsync(Guid id, UpdateCatalogWagonTypeRequest request);
    Task<bool> DeleteAsync(Guid id);
}

public class CatalogWagonTypeService(AppDbContext db) : ICatalogWagonTypeService
{
    public async Task<List<CatalogWagonTypeDto>> GetAllAsync(bool includeInactive = false)
    {
        try
        {
            if (!await db.CatalogWagonTypes.AnyAsync())
            {
                await SeedDefaultsAsync();
            }
        }
        catch
        {
            // Auto-create table if not exists
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "CatalogWagonTypes" (
                    "Id" uuid NOT NULL,
                    "Name" character varying(300) NOT NULL,
                    "Code" character varying(100) NULL,
                    "Description" character varying(500) NULL,
                    "SortOrder" integer NOT NULL,
                    "IsActive" boolean NOT NULL,
                    "IsSystem" boolean NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_CatalogWagonTypes" PRIMARY KEY ("Id")
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogWagonTypes_Name"
                    ON "CatalogWagonTypes" ("Name");
                """);

            if (!await db.CatalogWagonTypes.AnyAsync())
            {
                await SeedDefaultsAsync();
            }
        }

        var query = db.CatalogWagonTypes.AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(w => w.IsActive);
        }

        return await query
            .OrderBy(w => w.SortOrder)
            .ThenBy(w => w.Name)
            .Select(w => ToDto(w))
            .ToListAsync();
    }

    public async Task<CatalogWagonTypeDto> CreateAsync(CreateCatalogWagonTypeRequest request)
    {
        var trimmedName = request.Name.Trim();
        var exists = await db.CatalogWagonTypes.AnyAsync(w => w.Name.ToLower() == trimmedName.ToLower());
        if (exists)
        {
            throw new ArgumentException("Bunday vagon turi allaqachon mavjud");
        }

        var maxSort = await db.CatalogWagonTypes.MaxAsync(w => (int?)w.SortOrder) ?? 0;
        var item = new CatalogWagonType
        {
            Name = trimmedName,
            Code = request.Code?.Trim(),
            Description = request.Description?.Trim(),
            SortOrder = request.SortOrder ?? (maxSort + 1),
            IsActive = true,
            IsSystem = false
        };

        db.CatalogWagonTypes.Add(item);
        await db.SaveChangesAsync();
        return ToDto(item);
    }

    public async Task<CatalogWagonTypeDto?> UpdateAsync(Guid id, UpdateCatalogWagonTypeRequest request)
    {
        var item = await db.CatalogWagonTypes.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return null;

        var trimmedName = request.Name.Trim();
        var duplicate = await db.CatalogWagonTypes.AnyAsync(w => w.Id != id && w.Name.ToLower() == trimmedName.ToLower());
        if (duplicate)
        {
            throw new ArgumentException("Bunday nomdagi vagon turi allaqachon mavjud");
        }

        item.Name = trimmedName;
        if (request.Code != null) item.Code = request.Code.Trim();
        if (request.Description != null) item.Description = request.Description.Trim();
        if (request.SortOrder.HasValue) item.SortOrder = request.SortOrder.Value;
        if (request.IsActive.HasValue) item.IsActive = request.IsActive.Value;

        await db.SaveChangesAsync();
        return ToDto(item);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var item = await db.CatalogWagonTypes.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return false;

        db.CatalogWagonTypes.Remove(item);
        await db.SaveChangesAsync();
        return true;
    }

    private async Task SeedDefaultsAsync()
    {
        var defaultTypes = new[]
        {
            "Suyultirilgan gaz mahsuloti uchun Vagon sisterna",
            "Gaz kondensati uchun Vagon sisterna",
            "Granula uchun Yopiq turdagi vagon",
            "Sera uchun Yopiq turdagi vagon",
            "Suyultirilgan gaz mahsuloti uchun Konteyner sisterna",
            "Konteyner sisterna yuklash uchun Fiting platforma"
        };

        var wagonTypes = defaultTypes.Select((name, sort) => new CatalogWagonType
        {
            Name = name,
            SortOrder = sort,
            IsActive = true,
            IsSystem = true
        }).ToList();

        db.CatalogWagonTypes.AddRange(wagonTypes);
        await db.SaveChangesAsync();
    }

    private static CatalogWagonTypeDto ToDto(CatalogWagonType w) => new(
        w.Id, w.Name, w.Code, w.Description, w.SortOrder, w.IsActive, w.IsSystem, w.CreatedAt);
}
