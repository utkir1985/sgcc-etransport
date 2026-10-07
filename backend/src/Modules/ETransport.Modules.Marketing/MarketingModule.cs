using ETransport.Modules.Marketing.Services;
using Microsoft.Extensions.DependencyInjection;

namespace ETransport.Modules.Marketing;

public static class MarketingModule
{
    public static IServiceCollection AddMarketingModule(this IServiceCollection services)
    {
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IContractorService, ContractorService>();
        services.AddScoped<IContractorDestinationService, ContractorDestinationService>();
        services.AddScoped<ICatalogProductService, CatalogProductService>();
        services.AddScoped<ICatalogWagonTypeService, CatalogWagonTypeService>();
        services.AddScoped<ICatalogStationService, CatalogStationService>();
        return services;
    }
}
