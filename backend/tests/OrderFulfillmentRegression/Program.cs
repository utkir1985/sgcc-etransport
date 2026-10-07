
using System;
using System.Linq;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ETransport.Infrastructure.Data;
using ETransport.Core.Entities;
using ETransport.Core.DTOs;

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseNpgsql("Host=localhost;Port=5432;Database=etransport;Username=etransport;Password=etransport_secret")
    .Options;

using var db = new AppDbContext(options);

Console.WriteLine("=== MONTHLY ORDERS (LPG / Suyultirilgan gaz) ===");
var orders = await db.MonthlyOrders
    .Include(o => o.Lines)
    .Where(o => o.ProductType.ToLower().Contains("gaz") || o.OrderNumber.StartsWith("LPG"))
    .ToListAsync();

foreach (var o in orders)
{
    var linesWagons = o.Lines.Sum(l => l.WagonCount);
    var linesFulfilled = o.Lines.Sum(l => l.FulfilledWagonCount);
    Console.WriteLine($"Order: {o.OrderNumber} | Status: {o.Status} | Reja: {linesWagons} | Fulfilled: {linesFulfilled}");
    foreach (var l in o.Lines)
    {
        Console.WriteLine($"   Line: {l.Contractor} -> {l.DestinationStation} | Reja: {l.WagonCount} | Fulfilled: {l.FulfilledWagonCount}");
    }
}

Console.WriteLine("\n=== LOADING REGISTRIES ===");
var registries = await db.LoadingRegistries
    .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
    .ToListAsync();

Console.WriteLine($"Total LoadingRegistries: {registries.Count}");
int totalLpgRegistriesWagons = 0;
foreach (var r in registries)
{
    var prod = r.EmptyWagonArrival?.ProductType ?? "unknown";
    List<LoadingRegistryWagonRouteDto> routes = new();
    try { routes = JsonSerializer.Deserialize<List<LoadingRegistryWagonRouteDto>>(r.WagonRoutesJson) ?? new(); } catch {}
    Console.WriteLine($"Registry: {r.RegistryNumber} | Date: {r.PreparedAt:yyyy-MM-dd HH:mm} | Prod: {prod} | Wagons in routes: {routes.Count} | OrderDeducted: {r.OrderDeductedWagons} | OrderId: {r.MonthlyOrderId}");
    if (prod.ToLower().Contains("gaz") || prod.ToLower().Contains("lpg"))
    {
        totalLpgRegistriesWagons += routes.Count;
    }
}
Console.WriteLine($"Total LPG wagons across all registries: {totalLpgRegistriesWagons}");

Console.WriteLine("\n=== EMPTY WAGON ARRIVALS (LPG) ===");
var arrivals = await db.EmptyWagonArrivals
    .Include(a => a.Units)
    .Where(a => a.ProductType.ToLower().Contains("gaz") || a.ProductType.ToLower().Contains("lpg"))
    .ToListAsync();

foreach (var a in arrivals)
{
    var totalUnits = a.Units.Count;
    var sealedCount = a.Units.Count(u => u.IsSealed);
    var bruttoCount = a.Units.Count(u => !string.IsNullOrEmpty(u.GrossWeight));
    Console.WriteLine($"Arrival: {a.ArrivalNumber} ({a.ArrivalDate:yyyy-MM-dd}) | Total units: {totalUnits} | Brutto: {bruttoCount} | Sealed: {sealedCount} | HasRegistry: {a.LoadingRegistryId != null}");
}
