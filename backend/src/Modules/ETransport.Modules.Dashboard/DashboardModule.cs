using ETransport.Modules.Dashboard.Services;
using Microsoft.Extensions.DependencyInjection;

namespace ETransport.Modules.Dashboard;

public static class DashboardModule
{
    public static IServiceCollection AddDashboardModule(this IServiceCollection services)
    {
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IServerStatusService, ServerStatusService>();
        return services;
    }
}
