using ETransport.Modules.Warehouse.Controllers;
using Microsoft.Extensions.DependencyInjection;

namespace ETransport.Modules.Warehouse;

public static class WarehouseModule
{
    public static IServiceCollection AddWarehouseModule(this IServiceCollection services)
    {
        services.AddScoped<IWarehouseLoadingService, WarehouseLoadingService>();
        return services;
    }
}
