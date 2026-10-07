using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Dispatching.Services;

public interface IPlanService
{
    Task<List<DailyPlanDto>> GetAllAsync();
    Task<List<OrderPlanBalanceDto>> GetAllocatableOrdersAsync(string? logisticsType = null);
    Task<List<PlanWagonAvailabilityDto>> GetWagonAvailabilityAsync(string? productType = null, Guid? excludePlanId = null);
    Task<DailyPlanDto> CreateAsync(CreateDailyPlanRequest request, Guid userId);
    Task<DailyPlanDto?> UpdateAsync(Guid id, CreateDailyPlanRequest request, Guid userId);
    Task<bool> DeleteAsync(Guid id, Guid userId);
    Task<DailyPlanDto?> ApproveMsMxAsync(Guid id, Guid userId);
    Task<DailyPlanDto?> ApproveRailwayAsync(Guid id, Guid userId);
    Task<DailyPlanDto?> ApproveWarehouseAsync(Guid id, Guid userId);
    Task<DailyPlanDto?> ApproveSecurityAsync(Guid id, Guid userId);
}

public class PlanService(AppDbContext db) : IPlanService
{
    /// <summary>
    /// Taqsimot faqat estakadaga qo‘yilgan bo‘sh vagonlar bo‘yicha.
    /// </summary>
    private static readonly string[] TareReadyStages =
    [
        "EstakadaPlaced",
    ];

    public async Task<List<DailyPlanDto>> GetAllAsync()
    {
        var plans = await db.DailyPlans
            .Include(p => p.MonthlyOrder)
            .Include(p => p.CreatedBy)
            .Include(p => p.Lines)
            .OrderByDescending(p => p.PlanDate)
            .ThenByDescending(p => p.CreatedAt)
            .ToListAsync();
        return plans.Select(ToDto).ToList();
    }

    public async Task<List<OrderPlanBalanceDto>> GetAllocatableOrdersAsync(string? logisticsType = null)
    {
        var query = db.MonthlyOrders
            .AsNoTracking()
            .Include(o => o.Lines)
            .Where(o => o.Status == OrderStatus.Active);

        if (!string.IsNullOrWhiteSpace(logisticsType))
            query = query.Where(o => o.LogisticsType == logisticsType);

        var orders = await query
            .OrderByDescending(o => o.Year).ThenByDescending(o => o.Month)
            .ToListAsync();

        var plannedByLine = await GetReservedByOrderLineAsync(orders.Select(o => o.Id).ToList());

        return orders.Select(o =>
        {
            var lines = o.Lines
                .Where(l => l.QuantityUnit == Core.Constants.OrderQuantityUnits.Wagon || string.IsNullOrEmpty(l.QuantityUnit))
                .OrderBy(l => l.SortOrder)
                .Select(l =>
                {
                    var planned = plannedByLine.GetValueOrDefault(l.Id);
                    return new OrderLinePlanBalanceDto(
                        l.Id, l.Contractor, l.DestinationStation,
                        l.WagonCount, planned, Math.Max(0, l.WagonCount - planned));
                })
                .ToList();

            return new OrderPlanBalanceDto(
                o.Id, o.OrderNumber, o.ProductType, o.LogisticsType,
                o.Year, o.Month, o.Status.ToString(),
                lines.Sum(l => l.OrderedWagons),
                lines.Sum(l => l.PlannedWagons),
                lines.Sum(l => l.RemainingWagons),
                lines);
        }).Where(o => o.TotalRemaining > 0).ToList();
    }

    public async Task<List<PlanWagonAvailabilityDto>> GetWagonAvailabilityAsync(
        string? productType = null,
        Guid? excludePlanId = null)
    {
        var productFilter = string.IsNullOrWhiteSpace(productType) ? null : productType.Trim();

        // Faqat hali hech qanday taqsimotga biriktirilmagan estakada vagonlari.
        // 1C sync partiyalari bu yerda emas — faqat Temir yo‘l → Qo‘riqlash → estakada oqimi.
        // Tara majburiy emas (UNG chiqishda).
        var arrivals = await db.EmptyWagonArrivals
            .AsNoTracking()
            .Where(a =>
                a.DailyPlanLineId == null
                && a.DailyPlanId == null
                && TareReadyStages.Contains(a.Stage)
                && !a.ArrivalNumber.StartsWith("1C-"))
            .Select(a => new { a.ProductType, a.WagonCount })
            .ToListAsync();

        if (productFilter is not null)
        {
            arrivals = arrivals
                .Where(a =>
                    string.IsNullOrWhiteSpace(a.ProductType)
                    || string.Equals(a.ProductType.Trim(), productFilter, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var untypedWagons = arrivals
            .Where(a => string.IsNullOrWhiteSpace(a.ProductType))
            .Sum(a => a.WagonCount);

        var tareByProduct = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in arrivals)
        {
            var key = (row.ProductType ?? "").Trim();
            if (string.IsNullOrWhiteSpace(key)) continue; // umumiy fond — pastda har bir mahsulotga qo‘shiladi
            tareByProduct[key] = tareByProduct.GetValueOrDefault(key) + row.WagonCount;
        }

        // 1C bootstrap rejalari (DP-1C-*) jonli estakada fondini «band» qilib qo‘ymasligi kerak.
        var plansQuery = db.DailyPlans
            .AsNoTracking()
            .Include(p => p.MonthlyOrder)
            .Include(p => p.Lines)
            .Where(p =>
                p.Status != PlanStatus.Rejected
                && p.MonthlyOrder != null
                && !p.PlanNumber.StartsWith("DP-1C-"));

        if (excludePlanId is not null)
            plansQuery = plansQuery.Where(p => p.Id != excludePlanId.Value);

        var plans = await plansQuery.ToListAsync();
        if (productFilter is not null)
        {
            plans = plans
                .Where(p => string.Equals(
                    p.MonthlyOrder!.ProductType?.Trim(),
                    productFilter,
                    StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var planIds = plans.Select(p => p.Id).ToList();
        var lineIds = plans.SelectMany(p => p.Lines.Select(l => l.Id)).ToList();

        var assignedByLine = lineIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await db.EmptyWagonArrivals
                .AsNoTracking()
                .Where(a => a.DailyPlanLineId != null && lineIds.Contains(a.DailyPlanLineId.Value))
                .GroupBy(a => a.DailyPlanLineId!.Value)
                .Select(g => new { LineId = g.Key, Wagons = g.Sum(x => x.WagonCount) })
                .ToDictionaryAsync(x => x.LineId, x => x.Wagons);

        var assignedByPlan = planIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await db.EmptyWagonArrivals
                .AsNoTracking()
                .Where(a => a.DailyPlanId != null && planIds.Contains(a.DailyPlanId.Value))
                .GroupBy(a => a.DailyPlanId!.Value)
                .Select(g => new { PlanId = g.Key, Wagons = g.Sum(x => x.WagonCount) })
                .ToDictionaryAsync(x => x.PlanId, x => x.Wagons);

        var reservedByProduct = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var plan in plans)
        {
            var product = (plan.MonthlyOrder!.ProductType ?? "").Trim();
            if (string.IsNullOrWhiteSpace(product)) continue;

            var planned = plan.PlannedWagons > 0
                ? plan.PlannedWagons
                : plan.Lines.Sum(l => l.PlannedWagons);
            var byLines = plan.Lines.Sum(l => assignedByLine.GetValueOrDefault(l.Id));
            var byPlan = assignedByPlan.GetValueOrDefault(plan.Id);
            var assigned = Math.Max(byLines, byPlan);
            var unfilled = Math.Max(0, planned - assigned);
            if (unfilled == 0) continue;

            reservedByProduct[product] = reservedByProduct.GetValueOrDefault(product) + unfilled;
        }

        var productKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in tareByProduct.Keys) productKeys.Add(key);
        foreach (var key in reservedByProduct.Keys) productKeys.Add(key);
        if (productFilter is not null) productKeys.Add(productFilter);

        // Mahsulot turi yo‘q estakada vagonlari — faol buyurtma mahsulotlariga umumiy fond.
        if (untypedWagons > 0 && productFilter is null)
        {
            var activeProducts = await db.MonthlyOrders
                .AsNoTracking()
                .Where(o => o.Status == OrderStatus.Active && !string.IsNullOrWhiteSpace(o.ProductType))
                .Select(o => o.ProductType)
                .Distinct()
                .ToListAsync();
            foreach (var p in activeProducts)
            {
                var key = p.Trim();
                if (key.Length == 0) continue;
                if (key.Contains("-1C-", StringComparison.OrdinalIgnoreCase)) continue;
                if (key.StartsWith("MO-T-1C-", StringComparison.OrdinalIgnoreCase)) continue;
                productKeys.Add(key);
            }
        }

        return productKeys
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .Select(product =>
            {
                var tareReady = tareByProduct.GetValueOrDefault(product) + untypedWagons;
                var reserved = reservedByProduct.GetValueOrDefault(product);
                return new PlanWagonAvailabilityDto(
                    product,
                    tareReady,
                    reserved,
                    Math.Max(0, tareReady - reserved));
            })
            .ToList();
    }

    public async Task<DailyPlanDto> CreateAsync(CreateDailyPlanRequest request, Guid userId)
    {
        var order = await ValidatePlanRequestAsync(request, null);
        var lineInputs = (request.Lines ?? [])
            .Where(l => l.PlannedWagons > 0)
            .GroupBy(l => l.MonthlyOrderLineId)
            .Select(g => new CreateDailyPlanLineRequest(g.Key, g.Sum(x => x.PlannedWagons)))
            .ToList();

        var totalWagons = lineInputs.Sum(l => l.PlannedWagons);
        var year = DateTime.UtcNow.Year;
        var prefix = $"DP-{year}-";
        var existingNumbers = await db.DailyPlans
            .Where(p => p.PlanNumber.StartsWith(prefix))
            .Select(p => p.PlanNumber)
            .ToListAsync();
        var nextSeq = existingNumbers
            .Select(n => int.TryParse(n.AsSpan(prefix.Length), out var v) ? v : 0)
            .DefaultIfEmpty(0)
            .Max() + 1;
        var orderLineMap = order.Lines.ToDictionary(l => l.Id);
        var plan = new DailyPlan
        {
            PlanNumber = $"{prefix}{nextSeq:D3}",
            MonthlyOrderId = order.Id,
            PlanDate = DateTime.SpecifyKind(request.PlanDate.Date, DateTimeKind.Utc),
            PlannedWagons = totalWagons,
            PlannedAmount = request.PlannedAmount,
            Notes = request.Notes?.Trim() ?? string.Empty,
            Status = PlanStatus.PendingMsMx,
            CreatedById = userId,
        };

        foreach (var input in lineInputs)
        {
            var line = orderLineMap[input.MonthlyOrderLineId];
            plan.Lines.Add(new DailyPlanLine
            {
                MonthlyOrderLineId = line.Id,
                PlannedWagons = input.PlannedWagons,
                Contractor = line.Contractor,
                DestinationStation = line.DestinationStation,
            });
        }

        db.DailyPlans.Add(plan);
        await db.SaveChangesAsync();
        await db.Entry(plan).Reference(p => p.MonthlyOrder).LoadAsync();
        await db.Entry(plan).Reference(p => p.CreatedBy).LoadAsync();
        return ToDto(plan);
    }

    public async Task<DailyPlanDto?> UpdateAsync(Guid id, CreateDailyPlanRequest request, Guid userId)
    {
        var plan = await LoadPlanAsync(id);
        if (plan is null) return null;
        if (plan.Status == PlanStatus.Rejected)
            throw new InvalidOperationException("Rad etilgan taqsimot tahrirlanmaydi.");

        var order = await ValidatePlanRequestAsync(request, plan);
        var lineInputs = (request.Lines ?? [])
            .Where(l => l.PlannedWagons > 0)
            .GroupBy(l => l.MonthlyOrderLineId)
            .Select(g => new CreateDailyPlanLineRequest(g.Key, g.Sum(x => x.PlannedWagons)))
            .ToList();

        plan.MonthlyOrderId = order.Id;
        plan.PlanDate = DateTime.SpecifyKind(request.PlanDate.Date, DateTimeKind.Utc);
        plan.Notes = request.Notes?.Trim() ?? string.Empty;
        plan.PlannedAmount = request.PlannedAmount;
        plan.PlannedWagons = lineInputs.Sum(l => l.PlannedWagons);
        plan.Status = PlanStatus.Approved;

        db.DailyPlanLines.RemoveRange(plan.Lines);
        plan.Lines.Clear();

        var orderLineMap = order.Lines.ToDictionary(l => l.Id);
        foreach (var input in lineInputs)
        {
            var line = orderLineMap[input.MonthlyOrderLineId];
            plan.Lines.Add(new DailyPlanLine
            {
                MonthlyOrderLineId = line.Id,
                PlannedWagons = input.PlannedWagons,
                Contractor = line.Contractor,
                DestinationStation = line.DestinationStation,
            });
        }

        await db.SaveChangesAsync();
        return ToDto(plan);
    }

    public async Task<bool> DeleteAsync(Guid id, Guid userId)
    {
        var plan = await db.DailyPlans.Include(p => p.Lines).FirstOrDefaultAsync(p => p.Id == id);
        if (plan is null) return false;
        if (plan.Status == PlanStatus.Rejected)
            throw new InvalidOperationException("Rad etilgan taqsimot o'chirilmaydi.");

        var assigned = await db.EmptyWagonArrivals.AnyAsync(a => a.DailyPlanId == id);
        if (assigned)
            throw new InvalidOperationException("Bu taqsimotga vagonlar allaqachon biriktirilgan — o‘chirib bo‘lmaydi.");

        db.DailyPlanLines.RemoveRange(plan.Lines);
        db.DailyPlans.Remove(plan);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<DailyPlanDto?> ApproveMsMxAsync(Guid id, Guid userId)
    {
        var plan = await LoadPlanAsync(id);
        if (plan is null) return null;
        plan.Status = PlanStatus.PendingRailway;
        plan.ApprovedByMarketingId = userId;
        await db.SaveChangesAsync();
        return ToDto(plan);
    }

    public async Task<DailyPlanDto?> ApproveRailwayAsync(Guid id, Guid userId)
    {
        var plan = await LoadPlanAsync(id);
        if (plan is null) return null;
        plan.Status = PlanStatus.PendingWarehouse;
        await db.SaveChangesAsync();
        return ToDto(plan);
    }

    public async Task<DailyPlanDto?> ApproveWarehouseAsync(Guid id, Guid userId)
    {
        var plan = await LoadPlanAsync(id);
        if (plan is null) return null;
        plan.Status = PlanStatus.PendingSecurity;
        await db.SaveChangesAsync();
        return ToDto(plan);
    }

    public async Task<DailyPlanDto?> ApproveSecurityAsync(Guid id, Guid userId)
    {
        var plan = await LoadPlanAsync(id);
        if (plan is null) return null;
        plan.Status = PlanStatus.Approved;
        plan.ApprovedByAccountingId = userId;
        await db.SaveChangesAsync();
        return ToDto(plan);
    }

    private async Task<DailyPlan?> LoadPlanAsync(Guid id) =>
        await db.DailyPlans
            .Include(p => p.MonthlyOrder)
            .Include(p => p.CreatedBy)
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.Id == id);

    private async Task<MonthlyOrder> ValidatePlanRequestAsync(CreateDailyPlanRequest request, DailyPlan? existingPlan)
    {
        if (request.MonthlyOrderId is null || request.MonthlyOrderId == Guid.Empty)
            throw new InvalidOperationException("Kunlik reja uchun Active buyurtmani tanlang.");

        var lineInputs = (request.Lines ?? [])
            .Where(l => l.PlannedWagons > 0)
            .GroupBy(l => l.MonthlyOrderLineId)
            .Select(g => new CreateDailyPlanLineRequest(g.Key, g.Sum(x => x.PlannedWagons)))
            .ToList();

        if (lineInputs.Count == 0)
            throw new InvalidOperationException("Kamida bitta hududga vagon rejalashtiring.");

        var order = await db.MonthlyOrders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == request.MonthlyOrderId.Value)
            ?? throw new InvalidOperationException("Buyurtma topilmadi.");

        if (order.Status != OrderStatus.Active)
            throw new InvalidOperationException("Faqat Active (tasdiqlangan) buyurtmadan reja shakllantiriladi.");

        var orderLineMap = order.Lines.ToDictionary(l => l.Id);
        foreach (var input in lineInputs)
        {
            if (!orderLineMap.ContainsKey(input.MonthlyOrderLineId))
                throw new InvalidOperationException("Tanlangan qator ushbu buyurtmaga tegishli emas.");
        }

        var reserved = await GetReservedByOrderLineAsync([order.Id]);
        if (existingPlan is not null)
        {
            foreach (var existing in existingPlan.Lines)
            {
                if (reserved.ContainsKey(existing.MonthlyOrderLineId))
                    reserved[existing.MonthlyOrderLineId] = Math.Max(0, reserved[existing.MonthlyOrderLineId] - existing.PlannedWagons);
            }
        }

        foreach (var input in lineInputs)
        {
            var line = orderLineMap[input.MonthlyOrderLineId];
            var remaining = Math.Max(0, line.WagonCount - reserved.GetValueOrDefault(line.Id));
            if (input.PlannedWagons > remaining)
            {
                throw new InvalidOperationException(
                    $"{line.Contractor}: qolgan {remaining} vagon, reja {input.PlannedWagons} — oshib ketdi.");
            }
        }

        var requestedTotal = lineInputs.Sum(l => l.PlannedWagons);
        var availability = (await GetWagonAvailabilityAsync(order.ProductType, existingPlan?.Id))
            .FirstOrDefault(a => string.Equals(a.ProductType, order.ProductType, StringComparison.OrdinalIgnoreCase))
            ?? new PlanWagonAvailabilityDto(order.ProductType, 0, 0, 0);

        if (requestedTotal > availability.AvailableToAllocate)
        {
            throw new InvalidOperationException(
                $"Estakadadagi vagon yetarli emas: hozir faqat {availability.AvailableToAllocate} ta ajratish mumkin, so‘ralgan {requestedTotal} ta. " +
                $"(Estakada: {availability.TareReadyWagons}, boshqa rejalarda band: {availability.ReservedUnfilled}). " +
                "Avval bo‘sh vagonlar estakadaga qo‘yilishi kerak — shundan keyin yuklash taqsimoti yaratiladi.");
        }

        return order;
    }

    private async Task<Dictionary<Guid, int>> GetReservedByOrderLineAsync(List<Guid> orderIds)
    {
        if (orderIds.Count == 0) return new Dictionary<Guid, int>();

        var rows = await db.DailyPlanLines
            .AsNoTracking()
            .Where(l => l.DailyPlan != null
                && l.DailyPlan.MonthlyOrderId != null
                && orderIds.Contains(l.DailyPlan.MonthlyOrderId.Value)
                && l.DailyPlan.Status != PlanStatus.Rejected)
            .GroupBy(l => l.MonthlyOrderLineId)
            .Select(g => new { LineId = g.Key, Total = g.Sum(x => x.PlannedWagons) })
            .ToListAsync();

        return rows.ToDictionary(x => x.LineId, x => x.Total);
    }

    private static DailyPlanDto ToDto(DailyPlan p) => new(
        p.Id, p.PlanNumber, p.MonthlyOrderId, p.MonthlyOrder?.OrderNumber, p.MonthlyOrder?.ProductType,
        p.PlanDate, p.PlannedWagons, p.PlannedAmount, p.Notes,
        p.Status.ToString(), p.CreatedBy?.FullName ?? "", p.CreatedAt,
        (p.Lines ?? []).OrderBy(l => l.Contractor).Select(l => new DailyPlanLineDto(
            l.Id, l.MonthlyOrderLineId, l.Contractor, l.DestinationStation, l.PlannedWagons)).ToList());
}

public interface IShipmentService
{
    Task<List<ShipmentDto>> GetAllAsync();
    Task<ShipmentDetailDto?> GetByIdAsync(Guid id);
    Task<ShipmentDto> CreateFromPlanAsync(Guid planId);
    Task<ShipmentDetailDto?> AdvanceStatusAsync(Guid id, ShipmentStatus newStatus, Guid userId, string comment);
    Task<WagonDto?> AddWagonAsync(Guid shipmentId, CreateWagonRequest request);
    Task<WagonDto?> WeighWagonAsync(Guid wagonId, WeighingRequest request, Guid userId);
    Task<WagonDto?> SealWagonAsync(Guid wagonId, SealRequest request);
    Task<ShipmentDetailDto?> SecurityCheckAsync(Guid shipmentId, SecurityCheckRequest request, Guid userId);
}

public class ShipmentService(AppDbContext db) : IShipmentService
{
    public async Task<List<ShipmentDto>> GetAllAsync() =>
        await db.Shipments.Include(s => s.Wagons).OrderByDescending(s => s.CreatedAt)
            .Select(s => new ShipmentDto(s.Id, s.ShipmentNumber, s.ProductType, s.Status.ToString(),
                s.DestinationStation, s.Wagons.Count, s.CreatedAt, s.CompletedAt)).ToListAsync();

    public async Task<ShipmentDetailDto?> GetByIdAsync(Guid id)
    {
        var shipment = await db.Shipments
            .Include(s => s.Wagons).ThenInclude(w => w.WeighingRecord)
            .Include(s => s.StatusHistory).ThenInclude(h => h.ChangedBy)
            .FirstOrDefaultAsync(s => s.Id == id);
        return shipment is null ? null : ToDetailDto(shipment);
    }

    public async Task<ShipmentDto> CreateFromPlanAsync(Guid planId)
    {
        var plan = await db.DailyPlans
            .Include(p => p.MonthlyOrder)
            .Include(p => p.Lines)
            .FirstAsync(p => p.Id == planId);

        var count = await db.Shipments.CountAsync();
        var destination = plan.Lines.FirstOrDefault()?.DestinationStation
            ?? plan.MonthlyOrder?.Lines.OrderBy(l => l.SortOrder).FirstOrDefault()?.DestinationStation
            ?? "";

        var shipment = new Shipment
        {
            ShipmentNumber = $"SH-{DateTime.UtcNow:yyyy}-{count + 1:D3}",
            DailyPlanId = planId,
            ProductType = plan.MonthlyOrder?.ProductType ?? "LPG",
            LogisticsType = plan.MonthlyOrder?.LogisticsType ?? Core.Constants.LogisticsTypes.Railway,
            DestinationStation = destination,
            Status = ShipmentStatus.Created
        };
        db.Shipments.Add(shipment);
        await db.SaveChangesAsync();
        return new ShipmentDto(shipment.Id, shipment.ShipmentNumber, shipment.ProductType,
            shipment.Status.ToString(), shipment.DestinationStation, 0, shipment.CreatedAt, shipment.CompletedAt);
    }

    public async Task<ShipmentDetailDto?> AdvanceStatusAsync(Guid id, ShipmentStatus newStatus, Guid userId, string comment)
    {
        var shipment = await db.Shipments
            .Include(s => s.Wagons).ThenInclude(w => w.WeighingRecord)
            .Include(s => s.StatusHistory).ThenInclude(h => h.ChangedBy)
            .FirstOrDefaultAsync(s => s.Id == id);
        if (shipment is null) return null;

        db.ShipmentStatusHistories.Add(new ShipmentStatusHistory
        {
            ShipmentId = id, FromStatus = shipment.Status, ToStatus = newStatus,
            Comment = comment, ChangedById = userId
        });
        shipment.Status = newStatus;
        if (newStatus is ShipmentStatus.Completed or ShipmentStatus.Dispatched)
            shipment.CompletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return ToDetailDto(shipment);
    }

    public async Task<WagonDto?> AddWagonAsync(Guid shipmentId, CreateWagonRequest request)
    {
        if (await db.Shipments.FindAsync(shipmentId) is null) return null;
        var wagon = new Wagon { ShipmentId = shipmentId, WagonNumber = request.WagonNumber, CisternNumber = request.CisternNumber };
        db.Wagons.Add(wagon);
        await db.SaveChangesAsync();
        return new WagonDto(wagon.Id, wagon.WagonNumber, wagon.CisternNumber, wagon.IsInspected, wagon.IsLoaded, wagon.SealNumber, null);
    }

    public async Task<WagonDto?> WeighWagonAsync(Guid wagonId, WeighingRequest request, Guid userId)
    {
        var wagon = await db.Wagons.Include(w => w.WeighingRecord).FirstOrDefaultAsync(w => w.Id == wagonId);
        if (wagon is null) return null;
        if (wagon.WeighingRecord is null)
        {
            wagon.WeighingRecord = new WeighingRecord { WagonId = wagonId, TareWeight = request.TareWeight, GrossWeight = request.GrossWeight, OperatorId = userId };
            db.WeighingRecords.Add(wagon.WeighingRecord);
        }
        else
        {
            wagon.WeighingRecord.TareWeight = request.TareWeight;
            wagon.WeighingRecord.GrossWeight = request.GrossWeight;
            wagon.WeighingRecord.WeighedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return ToWagonDto(wagon);
    }

    public async Task<WagonDto?> SealWagonAsync(Guid wagonId, SealRequest request)
    {
        var wagon = await db.Wagons.Include(w => w.WeighingRecord).FirstOrDefaultAsync(w => w.Id == wagonId);
        if (wagon is null) return null;
        wagon.SealNumber = request.SealNumber;
        await db.SaveChangesAsync();
        return ToWagonDto(wagon);
    }

    public async Task<ShipmentDetailDto?> SecurityCheckAsync(Guid shipmentId, SecurityCheckRequest request, Guid userId)
    {
        var newStatus = request.Approved ? ShipmentStatus.SecurityChecked : ShipmentStatus.SecurityMismatch;
        return await AdvanceStatusAsync(shipmentId, newStatus, userId, request.Comment);
    }

    private static ShipmentDetailDto ToDetailDto(Shipment s) => new(
        s.Id, s.ShipmentNumber, s.ProductType, s.Status.ToString(), s.DestinationStation, s.CreatedAt,
        s.Wagons.Select(ToWagonDto).ToList(),
        s.StatusHistory.OrderByDescending(h => h.ChangedAt).Select(h => new StatusHistoryDto(
            h.FromStatus.ToString(), h.ToStatus.ToString(), h.Comment, h.ChangedBy?.FullName ?? "", h.ChangedAt)).ToList());

    private static WagonDto ToWagonDto(Wagon w) => new(
        w.Id, w.WagonNumber, w.CisternNumber, w.IsInspected, w.IsLoaded, w.SealNumber,
        w.WeighingRecord is null ? null : new WeighingRecordDto(
            w.WeighingRecord.TareWeight, w.WeighingRecord.GrossWeight, w.WeighingRecord.NetWeight, w.WeighingRecord.WeighedAt));
}

public interface IDispatchJournalService
{
    Task<List<DispatchJournalDto>> GetAllAsync();
    Task<DispatchJournalDto> CreateAsync(Guid shipmentId, string entry, Guid userId);
}

public class DispatchJournalService(AppDbContext db) : IDispatchJournalService
{
    public async Task<List<DispatchJournalDto>> GetAllAsync() =>
        await db.DispatchJournals.Include(j => j.RecordedBy).OrderByDescending(j => j.RecordedAt)
            .Select(j => new DispatchJournalDto(j.Id, j.ShipmentId, j.Entry, j.RecordedBy!.FullName, j.RecordedAt)).ToListAsync();

    public async Task<DispatchJournalDto> CreateAsync(Guid shipmentId, string entry, Guid userId)
    {
        var journal = new DispatchJournal { ShipmentId = shipmentId, Entry = entry, RecordedById = userId };
        db.DispatchJournals.Add(journal);
        await db.SaveChangesAsync();
        await db.Entry(journal).Reference(j => j.RecordedBy).LoadAsync();
        return new DispatchJournalDto(journal.Id, journal.ShipmentId, journal.Entry, journal.RecordedBy!.FullName, journal.RecordedAt);
    }
}
