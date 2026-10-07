using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace ETransport.Modules.Marketing.Services;

public interface ICatalogProductService
{
    Task<List<CatalogProductDto>> GetAllAsync(string? logisticsType = null, bool includeInactive = false);
    Task<CatalogProductDto> CreateAsync(CreateCatalogProductRequest request);
    Task<CatalogProductDto?> UpdateAsync(Guid id, UpdateCatalogProductRequest request);
    Task<bool> DeleteAsync(Guid id);
    Task<bool> ExistsAsync(string logisticsType, string name);
}

public class CatalogProductService(AppDbContext db) : ICatalogProductService
{
    private static readonly Regex PrefixPattern = new("^[A-Z0-9]{2,10}$", RegexOptions.Compiled);
    public async Task<List<CatalogProductDto>> GetAllAsync(string? logisticsType = null, bool includeInactive = false)
    {
        await EnsureSeededAsync();

        var query = db.CatalogProducts.AsQueryable();

        if (!string.IsNullOrWhiteSpace(logisticsType))
            query = query.Where(p => p.LogisticsType == logisticsType.Trim());

        if (!includeInactive)
            query = query.Where(p => p.IsActive);

        return await query
            .OrderBy(p => p.LogisticsType)
            .ThenBy(p => p.SortOrder)
            .ThenBy(p => p.Name)
            .Select(p => ToDto(p))
            .ToListAsync();
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            var existing = await db.CatalogProducts
                .Select(p => new { p.LogisticsType, p.Name })
                .ToListAsync();
            var keys = existing
                .Select(p => $"{p.LogisticsType}::{p.Name}")
                .ToHashSet(StringComparer.Ordinal);

            var toAdd = new List<CatalogProduct>();
            var sort = 0;
            foreach (var name in ProductTypes.RailwayAll)
            {
                if (!keys.Contains($"{LogisticsTypes.Railway}::{name}"))
                {
                    toAdd.Add(new CatalogProduct
                    {
                        Name = name,
                        LogisticsType = LogisticsTypes.Railway,
                        OrderPrefix = ProductTypes.DefaultOrderPrefix(name),
                        SortOrder = sort,
                        IsActive = true,
                        IsSystem = true,
                    });
                }
                sort++;
            }

            sort = 0;
            foreach (var name in ProductTypes.RoadAll)
            {
                if (!keys.Contains($"{LogisticsTypes.Road}::{name}"))
                {
                    toAdd.Add(new CatalogProduct
                    {
                        Name = name,
                        LogisticsType = LogisticsTypes.Road,
                        OrderPrefix = ProductTypes.DefaultOrderPrefix(name),
                        SortOrder = sort,
                        IsActive = true,
                        IsSystem = true,
                    });
                }
                sort++;
            }

            if (toAdd.Count == 0) return;
            db.CatalogProducts.AddRange(toAdd);
            await db.SaveChangesAsync();
        }
        catch
        {
            // Jadval hali yo'q bo'lishi mumkin — seeder yaratadi
        }
    }

    public async Task<CatalogProductDto> CreateAsync(CreateCatalogProductRequest request)
    {
        var name = request.Name.Trim();
        var logisticsType = request.LogisticsType.Trim();
        var orderPrefix = NormalizePrefix(request.OrderPrefix);

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Mahsulot nomi bo'sh bo'lmasligi kerak");
        if (name.Length > 300)
            throw new ArgumentException("Mahsulot nomi juda uzun");
        if (logisticsType is not (LogisticsTypes.Railway or LogisticsTypes.Road))
            throw new ArgumentException("Logistika turi Railway yoki Road bo'lishi kerak");

        var exists = await db.CatalogProducts.AnyAsync(p =>
            p.LogisticsType == logisticsType && p.Name == name);
        if (exists)
            throw new ArgumentException("Bu mahsulot allaqachon mavjud");
        await EnsurePrefixAvailableAsync(orderPrefix, name);

        var maxSort = await db.CatalogProducts
            .Where(p => p.LogisticsType == logisticsType)
            .Select(p => (int?)p.SortOrder)
            .MaxAsync() ?? -1;

        var product = new CatalogProduct
        {
            Name = name,
            LogisticsType = logisticsType,
            OrderPrefix = orderPrefix,
            SortOrder = request.SortOrder ?? maxSort + 1,
            IsActive = true,
            IsSystem = false,
        };

        db.CatalogProducts.Add(product);
        await db.SaveChangesAsync();
        return ToDto(product);
    }

    public async Task<CatalogProductDto?> UpdateAsync(Guid id, UpdateCatalogProductRequest request)
    {
        var product = await db.CatalogProducts.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return null;

        var name = request.Name.Trim();
        var orderPrefix = NormalizePrefix(request.OrderPrefix);
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Mahsulot nomi bo'sh bo'lmasligi kerak");

        var duplicate = await db.CatalogProducts.AnyAsync(p =>
            p.Id != id && p.LogisticsType == product.LogisticsType && p.Name == name);
        if (duplicate)
            throw new ArgumentException("Bu nomdagi mahsulot allaqachon mavjud");
        await EnsurePrefixAvailableAsync(orderPrefix, name, id);

        product.Name = name;
        product.OrderPrefix = orderPrefix;
        if (request.SortOrder.HasValue) product.SortOrder = request.SortOrder.Value;
        if (request.IsActive.HasValue) product.IsActive = request.IsActive.Value;

        await db.SaveChangesAsync();
        return ToDto(product);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var product = await db.CatalogProducts.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return false;
        if (product.IsSystem)
            throw new InvalidOperationException("Tizim mahsulotini o'chirib bo'lmaydi");

        db.CatalogProducts.Remove(product);
        await db.SaveChangesAsync();
        return true;
    }

    public Task<bool> ExistsAsync(string logisticsType, string name) =>
        db.CatalogProducts.AnyAsync(p =>
            p.LogisticsType == logisticsType
            && p.Name == name
            && p.IsActive);

    private static CatalogProductDto ToDto(CatalogProduct product) =>
        new(product.Id, product.Name, product.LogisticsType, product.OrderPrefix, product.SortOrder,
            product.IsActive, product.IsSystem, product.CreatedAt);

    private static string NormalizePrefix(string? value)
    {
        var prefix = (value ?? string.Empty).Trim().ToUpperInvariant();
        if (!PrefixPattern.IsMatch(prefix))
            throw new ArgumentException("Buyurtma ID prefiksi 2–10 ta lotin harfi yoki raqamdan iborat bo'lishi kerak");
        return prefix;
    }

    private async Task EnsurePrefixAvailableAsync(string prefix, string productName, Guid? excludedId = null)
    {
        var usedByAnotherProduct = await db.CatalogProducts.AnyAsync(p =>
            (!excludedId.HasValue || p.Id != excludedId.Value)
            && p.OrderPrefix == prefix
            && p.Name != productName);
        if (usedByAnotherProduct)
            throw new ArgumentException("Bu buyurtma ID prefiksi boshqa mahsulotga biriktirilgan");
    }
}
