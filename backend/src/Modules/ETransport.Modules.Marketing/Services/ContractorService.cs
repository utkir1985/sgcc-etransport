using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Marketing.Services;

public interface IContractorService
{
    Task<List<ContractorDto>> GetAllAsync(string logisticsType);
    Task<ContractorDto> CreateAsync(CreateContractorRequest request);
    Task<ContractorDto> UpdateAsync(Guid id, UpdateContractorRequest request);
    Task<bool> DeleteAsync(Guid id);
}

public class ContractorService(AppDbContext db) : IContractorService
{
    private static readonly string[] RogueNames =
    [
        "1C (plombali tortish)",
        "Hududgaz Andijon",
        "Hududgaz Jizzax",
        "Hududgaz Farg'ona",
        "Hududgaz Namangan",
        "Hududgaz Samarqand",
        "Hududgaz Toshkent",
        "Hududgaz Sirdaryo",
        "Hududgaz Surxandaryo",
        "Hududgaz Qashqadaryo"
    ];

    public async Task<List<ContractorDto>> GetAllAsync(string logisticsType)
    {
        var type = logisticsType.Trim();
        return await db.Contractors
            .Where(c => c.LogisticsType == type && !RogueNames.Contains(c.Name))
            .OrderByDescending(c => c.IsSystem)
            .ThenBy(c => c.Name)
            .Select(c => ToDto(c))
            .ToListAsync();
    }

    public async Task<ContractorDto> CreateAsync(CreateContractorRequest request)
    {
        var name = request.Name.Trim();
        var logisticsType = request.LogisticsType.Trim();

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Korxona nomi bo'sh bo'lmasligi kerak");
        if (name.Length > 300)
            throw new ArgumentException("Korxona nomi juda uzun");

        var exists = await db.Contractors.AnyAsync(c =>
            c.LogisticsType == logisticsType && c.Name == name);
        if (exists)
            throw new ArgumentException("Bu korxona allaqachon ro'yxatda mavjud");

        var contractor = new Contractor
        {
            Name = name,
            LogisticsType = logisticsType,
            IsSystem = false,
        };

        db.Contractors.Add(contractor);
        await db.SaveChangesAsync();
        return ToDto(contractor);
    }

    public async Task<ContractorDto> UpdateAsync(Guid id, UpdateContractorRequest request)
    {
        var contractor = await db.Contractors.FirstOrDefaultAsync(c => c.Id == id);
        if (contractor is null)
            throw new ArgumentException("Korxona topilmadi");

        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Korxona nomi bo'sh bo'lmasligi kerak");

        var exists = await db.Contractors.AnyAsync(c =>
            c.Id != id && c.LogisticsType == contractor.LogisticsType && c.Name == name);
        if (exists)
            throw new ArgumentException("Bu nomdagi korxona allaqachon mavjud");

        contractor.Name = name;
        if (!string.IsNullOrWhiteSpace(request.LogisticsType))
            contractor.LogisticsType = request.LogisticsType.Trim();

        await db.SaveChangesAsync();
        return ToDto(contractor);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var contractor = await db.Contractors.FirstOrDefaultAsync(c => c.Id == id);
        if (contractor is null) return false;

        db.Contractors.Remove(contractor);
        await db.SaveChangesAsync();
        return true;
    }

    private static ContractorDto ToDto(Contractor contractor) =>
        new(contractor.Id, contractor.Name, contractor.LogisticsType, contractor.IsSystem, contractor.CreatedAt);
}
