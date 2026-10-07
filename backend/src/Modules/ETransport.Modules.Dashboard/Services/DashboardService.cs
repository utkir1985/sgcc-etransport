using ETransport.Core.DTOs;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Dashboard.Services;

public interface IDashboardService
{
    Task<DashboardStatsDto> GetStatsAsync(string? role = null);
}

public class DashboardService(AppDbContext db) : IDashboardService
{
    public async Task<DashboardStatsDto> GetStatsAsync(string? role = null)
    {
        var pendingPlans = await db.DailyPlans.CountAsync(p =>
            p.Status == Core.Entities.PlanStatus.PendingMsMx ||
            p.Status == Core.Entities.PlanStatus.PendingRailway ||
            p.Status == Core.Entities.PlanStatus.PendingWarehouse ||
            p.Status == Core.Entities.PlanStatus.PendingSecurity);
        var pendingOrders = await db.MonthlyOrders.CountAsync(o =>
            o.Status == Core.Entities.OrderStatus.PendingAccounting
            || o.Status == Core.Entities.OrderStatus.PendingDeputyDirector
            || o.Status == Core.Entities.OrderStatus.PendingDispatching);

        var railwayOrders = await db.MonthlyOrders.CountAsync(o => o.LogisticsType == Core.Constants.LogisticsTypes.Railway);
        var roadOrders = await db.MonthlyOrders.CountAsync(o => o.LogisticsType == Core.Constants.LogisticsTypes.Road);
        var railwayShipments = await db.Shipments.CountAsync(s => s.LogisticsType == Core.Constants.LogisticsTypes.Railway);
        var roadShipments = await db.Shipments.CountAsync(s => s.LogisticsType == Core.Constants.LogisticsTypes.Road);

        return new DashboardStatsDto(
            await db.MonthlyOrders.CountAsync(),
            await db.DailyPlans.CountAsync(p => p.Status == Core.Entities.PlanStatus.Approved),
            await db.Shipments.CountAsync(s => s.Status != Core.Entities.ShipmentStatus.Completed && s.Status != Core.Entities.ShipmentStatus.Dispatched),
            await db.Shipments.CountAsync(s => s.Status == Core.Entities.ShipmentStatus.Completed || s.Status == Core.Entities.ShipmentStatus.Dispatched),
            pendingPlans + pendingOrders,
            await db.Wagons.CountAsync(w => !w.IsLoaded),
            railwayOrders,
            roadOrders,
            railwayShipments,
            roadShipments);
    }
}
