using ETransport.Modules.Dispatching.Services;
using Microsoft.Extensions.DependencyInjection;

namespace ETransport.Modules.Dispatching;

public static class DispatchingModule
{
    public static IServiceCollection AddDispatchingModule(this IServiceCollection services)
    {
        services.AddScoped<IPlanService, PlanService>();
        services.AddScoped<IShipmentService, ShipmentService>();
        services.AddScoped<IDispatchJournalService, DispatchJournalService>();
        return services;
    }
}
