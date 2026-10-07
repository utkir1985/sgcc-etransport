using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Marketing.Services;

public interface IContractorDestinationService
{
    Task<List<ContractorDestinationDto>> GetByContractorAsync(string logisticsType, string contractorName);
    Task<ContractorDestinationDto> CreateAsync(CreateContractorDestinationRequest request);
    Task<bool> DeleteAsync(Guid id);
}

public class ContractorDestinationService(AppDbContext db) : IContractorDestinationService
{
    public async Task<List<ContractorDestinationDto>> GetByContractorAsync(string logisticsType, string contractorName)
    {
        var type = logisticsType.Trim();
        var contractor = contractorName.Trim();
        if (string.IsNullOrWhiteSpace(contractor))
            return [];

        return await db.ContractorDestinations
            .Where(d => d.LogisticsType == type && d.ContractorName == contractor)
            .OrderByDescending(d => d.IsSystem)
            .ThenBy(d => d.StationName)
            .Select(d => ToDto(d))
            .ToListAsync();
    }

    public async Task<ContractorDestinationDto> CreateAsync(CreateContractorDestinationRequest request)
    {
        var contractorName = request.ContractorName.Trim();
        var logisticsType = request.LogisticsType.Trim();
        var stationName = request.StationName.Trim();

        if (string.IsNullOrWhiteSpace(contractorName))
            throw new ArgumentException("Korxona tanlanishi kerak");
        if (string.IsNullOrWhiteSpace(stationName))
            throw new ArgumentException("Stansiya nomi bo'sh bo'lmasligi kerak");
        if (stationName.Length > 200)
            throw new ArgumentException("Stansiya nomi juda uzun");

        var exists = await db.ContractorDestinations.AnyAsync(d =>
            d.LogisticsType == logisticsType
            && d.ContractorName == contractorName
            && d.StationName == stationName);
        if (exists)
            throw new ArgumentException("Bu stansiya allaqachon ro'yxatda mavjud");

        var destination = new ContractorDestination
        {
            ContractorName = contractorName,
            LogisticsType = logisticsType,
            StationName = stationName,
            IsSystem = false,
        };

        db.ContractorDestinations.Add(destination);
        await db.SaveChangesAsync();
        return ToDto(destination);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var destination = await db.ContractorDestinations.FirstOrDefaultAsync(d => d.Id == id);
        if (destination is null) return false;
        if (destination.IsSystem)
            throw new InvalidOperationException("Tizim stansiyasini o'chirib bo'lmaydi");

        db.ContractorDestinations.Remove(destination);
        await db.SaveChangesAsync();
        return true;
    }

    private static ContractorDestinationDto ToDto(ContractorDestination destination) =>
        new(
            destination.Id,
            destination.ContractorName,
            destination.LogisticsType,
            destination.StationName,
            destination.IsSystem,
            destination.CreatedAt);
}
