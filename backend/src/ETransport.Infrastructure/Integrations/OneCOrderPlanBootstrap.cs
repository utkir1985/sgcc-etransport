using ETransport.Core.Constants;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Integrations;

/// <summary>
/// 1C plombali partiyalar uchun Active buyurtma + Approved kunlik taqsimot.
/// Qo‘lda kiritish o‘rganilgunga qadar jarayon zanjirini to‘ldirib turadi.
/// </summary>
public static class OneCOrderPlanBootstrap
{
    public static async Task EnsureForOneCArrivalsAsync(
        AppDbContext db,
        ILogger logger,
        CancellationToken cancellationToken = default)
    {
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .Where(a => a.ArrivalNumber.StartsWith("1C-"))
            .OrderBy(a => a.ArrivalDate)
            .ToListAsync(cancellationToken);

        if (arrivals.Count == 0) return;

        var marketingId = await ResolveUserIdAsync(db, ["Marketing", "Admin"], cancellationToken);
        var dispatchId = await ResolveUserIdAsync(db, ["Dispatching", "Admin"], cancellationToken);
        if (marketingId == Guid.Empty || dispatchId == Guid.Empty)
        {
            logger.LogWarning("1C buyurtma/taqsimot: Marketing yoki Dispatching user topilmadi");
            return;
        }

        var changed = false;

        foreach (var arrival in arrivals)
        {
            var product = CyrillicToLatin.ToProductName(arrival.ProductType);
            if (string.IsNullOrWhiteSpace(product))
                product = "1C mahsulot";
            if (arrival.ProductType != product)
            {
                arrival.ProductType = product;
                changed = true;
            }

            var day = DateTime.SpecifyKind(arrival.ArrivalDate.Date, DateTimeKind.Utc);
            var year = day.Year;
            var month = day.Month;
            var wagonCount = arrival.Units.Count > 0 ? arrival.Units.Count : Math.Max(1, arrival.WagonCount);

            var orderKey = $"MO-T-1C-{year:0000}{month:00}-{ProductCode(product)}";
            var order = await db.MonthlyOrders
                .Include(o => o.Lines)
                .FirstOrDefaultAsync(o => o.OrderNumber == orderKey, cancellationToken);

            if (order is null)
            {
                order = new MonthlyOrder
                {
                    OrderNumber = orderKey,
                    LogisticsType = LogisticsTypes.Railway,
                    ContractNumber = $"1C-{year:0000}{month:00}",
                    ProductType = product,
                    Year = year,
                    Month = month,
                    Deadline = DateTime.SpecifyKind(new DateTime(year, month, DateTime.DaysInMonth(year, month)), DateTimeKind.Utc),
                    Status = OrderStatus.Active,
                    CreatedById = marketingId,
                    CreatedAt = DateTime.UtcNow,
                    SubmittedAt = DateTime.UtcNow,
                    SubmittedById = marketingId,
                    ApprovedAt = DateTime.UtcNow,
                    ApprovedByAccountingId = marketingId,
                    AccountingApproverName = "1C sync",
                    MarketingApprovedAt = DateTime.UtcNow,
                    ApprovedByMarketingId = marketingId,
                    MarketingApproverName = "1C sync",
                    SubmittedToDispatchAt = DateTime.UtcNow,
                    SubmittedToDispatchById = marketingId,
                    DispatchApprovedAt = DateTime.UtcNow,
                    ApprovedByDispatchId = dispatchId,
                    DispatchApproverName = "1C sync",
                    Lines =
                    [
                        new MonthlyOrderLine
                        {
                            SortOrder = 1,
                            Contractor = "1C (plombali tortish)",
                            WagonCount = wagonCount,
                            QuantityUnit = OrderQuantityUnits.Wagon,
                            DestinationStation = "Kengsoy",
                            AccountingStatus = LineAccountingStatuses.DispatchApproved,
                            AccountingReviewChecked = true,
                            AccountantSigned = true,
                            WeigherSigned = true,
                        },
                    ],
                };
                db.MonthlyOrders.Add(order);
                changed = true;
                logger.LogInformation("1C buyurtma yaratildi: {Order} · {Product} · {Wagons} vagon",
                    orderKey, product, wagonCount);
            }
            else
            {
                if (order.Status != OrderStatus.Active && order.Status != OrderStatus.Completed)
                {
                    order.Status = OrderStatus.Active;
                    changed = true;
                }

                if (order.ProductType != product)
                {
                    order.ProductType = product;
                    changed = true;
                }

                var line = order.Lines.OrderBy(l => l.SortOrder).FirstOrDefault();
                if (line is null)
                {
                    line = new MonthlyOrderLine
                    {
                        MonthlyOrderId = order.Id,
                        SortOrder = 1,
                        Contractor = "1C (plombali tortish)",
                        WagonCount = wagonCount,
                        QuantityUnit = OrderQuantityUnits.Wagon,
                        DestinationStation = "Kengsoy",
                        AccountingStatus = LineAccountingStatuses.DispatchApproved,
                        AccountingReviewChecked = true,
                        AccountantSigned = true,
                        WeigherSigned = true,
                    };
                    order.Lines.Add(line);
                    changed = true;
                }
                else
                {
                    // Oylik jami: shu mahsulotdagi 1C partiyalar
                    var monthTotal = arrivals
                        .Where(a =>
                            a.ArrivalDate.Year == year
                            && a.ArrivalDate.Month == month
                            && string.Equals(
                                CyrillicToLatin.ToProductName(a.ProductType),
                                product,
                                StringComparison.OrdinalIgnoreCase))
                        .Sum(a => a.Units.Count > 0 ? a.Units.Count : Math.Max(1, a.WagonCount));
                    if (line.WagonCount < monthTotal)
                    {
                        line.WagonCount = monthTotal;
                        changed = true;
                    }

                    if (line.AccountingStatus != LineAccountingStatuses.DispatchApproved)
                    {
                        line.AccountingStatus = LineAccountingStatuses.DispatchApproved;
                        changed = true;
                    }
                }
            }

            var previousStatus = order.Status;
            OrderFulfillment.RefreshStatus(order);
            changed |= previousStatus != order.Status;

            // Save order first so Plan FK works when newly added
            if (changed)
                await db.SaveChangesAsync(cancellationToken);

            var planNumber = $"DP-1C-{day:yyyyMMdd}-{ProductCode(product)}";
            var plan = await db.DailyPlans
                .Include(p => p.Lines)
                .FirstOrDefaultAsync(p => p.PlanNumber == planNumber, cancellationToken);

            if (plan is null)
            {
                var orderLine = order.Lines.OrderBy(l => l.SortOrder).First();
                plan = new DailyPlan
                {
                    PlanNumber = planNumber,
                    MonthlyOrderId = order.Id,
                    PlanDate = day,
                    PlannedWagons = wagonCount,
                    PlannedAmount = 0,
                    Notes = "1C plombali tortish asosida avtomatik taqsimot",
                    Status = PlanStatus.Approved,
                    CreatedById = dispatchId,
                    CreatedAt = DateTime.UtcNow,
                    ApprovedByMarketingId = marketingId,
                    Lines =
                    [
                        new DailyPlanLine
                        {
                            MonthlyOrderLineId = orderLine.Id,
                            PlannedWagons = wagonCount,
                            Contractor = orderLine.Contractor,
                            DestinationStation = orderLine.DestinationStation,
                        },
                    ],
                };
                db.DailyPlans.Add(plan);
                await db.SaveChangesAsync(cancellationToken);
                changed = true;
                logger.LogInformation("1C taqsimot yaratildi: {Plan} · {Date:yyyy-MM-dd} · {Wagons} vagon",
                    planNumber, day, wagonCount);
            }
            else
            {
                if (plan.Status != PlanStatus.Approved)
                {
                    plan.Status = PlanStatus.Approved;
                    changed = true;
                }

                if (plan.PlannedWagons < wagonCount)
                {
                    plan.PlannedWagons = wagonCount;
                    changed = true;
                }

                var planLine = plan.Lines.FirstOrDefault();
                if (planLine is not null && planLine.PlannedWagons < wagonCount)
                {
                    planLine.PlannedWagons = wagonCount;
                    changed = true;
                }

                if (plan.MonthlyOrderId != order.Id)
                {
                    plan.MonthlyOrderId = order.Id;
                    changed = true;
                }
            }

            if (arrival.DailyPlanId != plan.Id)
            {
                arrival.DailyPlanId = plan.Id;
                arrival.DailyPlanLineId = null;
                changed = true;
            }
        }

        if (changed)
            await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task<Guid> ResolveUserIdAsync(
        AppDbContext db,
        IReadOnlyList<string> roles,
        CancellationToken cancellationToken)
    {
        var users = await db.Users
            .AsNoTracking()
            .Where(u => u.IsActive && roles.Contains(u.Role))
            .Select(u => new { u.Id, u.Role })
            .ToListAsync(cancellationToken);

        foreach (var role in roles)
        {
            var hit = users.FirstOrDefault(u => u.Role == role);
            if (hit is not null) return hit.Id;
        }

        return Guid.Empty;
    }

    private static string ProductCode(string product) => product switch
    {
        var p when p.Contains("Suyultirilgan", StringComparison.OrdinalIgnoreCase) => "SG",
        var p when p.Contains("kondensat", StringComparison.OrdinalIgnoreCase) => "TG",
        var p when p.Contains("oltingugurt", StringComparison.OrdinalIgnoreCase) => "OG",
        var p when p.Contains("polietilen", StringComparison.OrdinalIgnoreCase)
            || p.Contains("Etilen", StringComparison.OrdinalIgnoreCase) => "PE",
        var p when p.Contains("Buten", StringComparison.OrdinalIgnoreCase) => "B1",
        _ => "XX",
    };
}
