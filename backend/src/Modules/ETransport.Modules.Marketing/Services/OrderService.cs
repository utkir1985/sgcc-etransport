using System.Text.RegularExpressions;
using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Core.Interfaces;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Pdf;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Marketing.Services;

public interface IOrderService
{
    Task<List<MonthlyOrderDto>> GetAllAsync(string? logisticsType = null);
    Task<MonthlyOrderDto?> GetByIdAsync(Guid id);
    Task<MonthlyOrderDto> CreateAsync(CreateMonthlyOrderRequest request, Guid userId);
    Task<MonthlyOrderDto?> UpdateAsync(Guid id, UpdateMonthlyOrderRequest request, Guid userId);
    Task<MonthlyOrderDto?> SubmitForAccountingAsync(Guid id, Guid userId);
    Task<MonthlyOrderDto?> SaveAccountingReviewAsync(Guid id, SaveAccountingReviewRequest request);
    Task<MonthlyOrderDto?> FinalizeAccountingReviewAsync(Guid id, Guid userId, SaveAccountingReviewRequest? review = null);
    Task<MonthlyOrderDto?> ResubmitRejectedToAccountingAsync(Guid id, Guid userId);
    Task<MonthlyOrderDto?> SubmitToDispatchAsync(Guid id, Guid userId);
    Task<MonthlyOrderDto?> ApproveDeputyAsync(Guid id, Guid userId);
    Task<MonthlyOrderDto?> ApproveDispatchAsync(Guid id, Guid userId);
    Task<bool> DeleteAsync(Guid id);
}

public class OrderService(
    AppDbContext db,
    IQrLinkService qrLinkService,
    IDocumentPdfGenerator pdfGenerator,
    IDocumentNumberingService numberingService) : IOrderService
{
    private static readonly Regex SplitOrderSuffix = new(@"-M\d{2}$", RegexOptions.Compiled);
    private static readonly Regex RootOrderNumber = new(@"^((?:MO-(?:T|A)-\d{4}-\d{3}|[A-Z0-9]{2,10}-\d{5}))", RegexOptions.Compiled);
    public async Task<List<MonthlyOrderDto>> GetAllAsync(string? logisticsType = null)
    {
        var query = db.MonthlyOrders
            .Include(o => o.CreatedBy)
            .Include(o => o.Lines)
            .Include(o => o.Attachments).ThenInclude(a => a.UploadedBy)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(logisticsType))
        {
            var lt = logisticsType.Trim();
            query = query.Where(o => EF.Functions.ILike(o.LogisticsType, lt));
        }

        var orders = await query
            .OrderByDescending(o => o.Year)
            .ThenByDescending(o => o.Month)
            .ThenByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(ToDto).ToList();
    }

    public async Task<MonthlyOrderDto?> GetByIdAsync(Guid id)
    {
        var order = await db.MonthlyOrders
            .Include(o => o.CreatedBy)
            .Include(o => o.Lines)
            .Include(o => o.Attachments).ThenInclude(a => a.UploadedBy)
            .FirstOrDefaultAsync(o => o.Id == id);
        return order is null ? null : ToDto(order);
    }

    public async Task<MonthlyOrderDto> CreateAsync(CreateMonthlyOrderRequest request, Guid userId)
    {
        await ValidateRequestAsync(request.LogisticsType, request.ProductType, request.ProductGrade, request.ContractNumber, request.Lines, userId);

        var creator = await db.Users.FindAsync(userId);
        var order = new MonthlyOrder
        {
            OrderNumber = await GenerateNextOrderNumberAsync(request.LogisticsType, request.ProductType),
            LogisticsType = request.LogisticsType,
            ContractNumber = request.ContractNumber.Trim(),
            ProductType = request.ProductType,
            ProductGrade = request.ProductGrade?.Trim() ?? "",
            Year = request.Year,
            Month = request.Month,
            Deadline = ToUtcDate(request.Deadline),
            Status = OrderStatus.Draft,
            CreatedById = userId,
            MarketingApproverName = creator?.FullName ?? "",
            Lines = MapLines(request.Lines),
        };

        db.MonthlyOrders.Add(order);
        db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "OrderCreated",
            EntityType = nameof(MonthlyOrder),
            EntityId = order.Id.ToString(),
            Details = $"Yangi buyurtma yaratildi: #{order.OrderNumber} ({order.ProductType}, {order.Lines.Sum(l => l.WagonCount)} ta vagon)",
            Category = "Order",
            Status = "Success",
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        await db.Entry(order).Reference(o => o.CreatedBy).LoadAsync();
        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> UpdateAsync(Guid id, UpdateMonthlyOrderRequest request, Guid userId)
    {
        var order = await db.MonthlyOrders
            .Include(o => o.Lines)
            .Include(o => o.CreatedBy)
            .Include(o => o.Attachments).ThenInclude(a => a.UploadedBy)
            .FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return null;

        var user = await db.Users.FindAsync(userId);
        var isAdminOrMarketing = user?.Role is UserRoles.Admin or UserRoles.Marketing or UserRoles.DispatchSupervisor;
        if (!isAdminOrMarketing && order.CreatedById != userId && order.CreatedById != Guid.Empty)
            throw new ArgumentException("Buyurtmani faqat uni yaratgan xodim yoki Administrator tahrirlashi mumkin");
        if (order.Status is OrderStatus.Completed or OrderStatus.Cancelled)
            throw new ArgumentException("Yakunlangan yoki bekor qilingan buyurtmani tahrirlash mumkin emas");
        if (string.IsNullOrWhiteSpace(request.EditComment))
            throw new ArgumentException("Tahrirlash izohini kiriting");

        await ValidateRequestAsync(order.LogisticsType, request.ProductType, request.ProductGrade, request.ContractNumber, request.Lines, userId);

        var changes = new List<string>();
        if (!string.Equals(order.ProductType, request.ProductType, StringComparison.Ordinal))
        {
            if (order.Status == OrderStatus.Active || order.ApprovedAt != null || order.DispatchApprovedAt != null)
                throw new ArgumentException("Tasdiqlangan buyurtmaning mahsulot turini o‘zgartirish mumkin emas");

            var oldNumber = order.OrderNumber;
            order.OrderNumber = await GenerateNextOrderNumberAsync(order.LogisticsType, request.ProductType);
            changes.Add($"Mahsulot turi: {order.ProductType} → {request.ProductType}");
            changes.Add($"Buyurtma raqami mahsulot prefiksiga moslab yangilandi: {oldNumber} → {order.OrderNumber}");
        }
        if (!string.Equals(order.ContractNumber, request.ContractNumber.Trim(), StringComparison.Ordinal))
            changes.Add($"Shartnoma: {order.ContractNumber} → {request.ContractNumber.Trim()}");
        if (order.Deadline.Date != request.Deadline.Date)
            changes.Add($"Muddat: {order.Deadline:dd.MM.yyyy} → {request.Deadline:dd.MM.yyyy}");
        var oldLines = string.Join("|", order.Lines.OrderBy(l => l.SortOrder)
            .Select(l => $"{l.Contractor}:{l.WagonCount}:{l.TonCount}:{l.DestinationStation}"));
        var newLines = string.Join("|", request.Lines.OrderBy(l => l.SortOrder)
            .Select(l => $"{l.Contractor}:{l.WagonCount}:{l.TonCount}:{l.DestinationStation}"));
        if (!string.Equals(oldLines, newLines, StringComparison.Ordinal))
            changes.Add("Buyurtma qatorlari o‘zgartirildi");

        order.ContractNumber = request.ContractNumber.Trim();
        if (!string.Equals(order.ProductGrade, request.ProductGrade?.Trim() ?? "", StringComparison.Ordinal))
            changes.Add($"Mahsulot markasi: {order.ProductGrade} → {request.ProductGrade?.Trim()}");
        order.ProductGrade = request.ProductGrade?.Trim() ?? "";
        order.ProductType = request.ProductType;
        order.Deadline = ToUtcDate(request.Deadline);

        var wasSubmitted = order.Status != OrderStatus.Draft;
        SyncDraftLines(order, request.Lines);
        if (wasSubmitted)
        {
            order.Status = OrderStatus.PendingAccounting;
            order.ApprovedAt = null;
            order.ApprovedByAccountingId = null;
            order.AccountingApproverName = string.Empty;
            order.SubmittedToDispatchAt = null;
            order.SubmittedToDispatchById = null;
            order.DeputyApprovedAt = null;
            order.ApprovedByDeputyId = null;
            order.DeputyApproverName = string.Empty;
            order.DispatchApprovedAt = null;
            order.ApprovedByDispatchId = null;
            order.DispatchApproverName = string.Empty;
            foreach (var line in order.Lines)
            {
                line.AccountingStatus = LineAccountingStatuses.Pending;
                line.AccountantSigned = false;
                line.AccountingReviewChecked = null;
            }
        }
        db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Action = "OrderEdited",
            EntityType = nameof(MonthlyOrder),
            EntityId = order.Id.ToString(),
            Details = JsonSerializer.Serialize(new { comment = request.EditComment.Trim(), changes }),
        });
        await db.SaveChangesAsync();

        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> SubmitForAccountingAsync(Guid id, Guid userId)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (order.Status != OrderStatus.Draft)
            throw new ArgumentException("Faqat qoralama buyurtmani buxgalteriyaga yuborish mumkin");

        if (order.Attachments.Count == 0)
            throw new ArgumentException("Ilova biriktirish majburiy — kamida bitta fayl qo‘shing");

        var isCondensate = order.ProductType.Contains("kondensat", StringComparison.OrdinalIgnoreCase);

        if (isCondensate)
        {
            foreach (var line in order.Lines)
            {
                line.AccountingStatus = LineAccountingStatuses.PendingDeputy;
                line.AccountantSigned = true;
                line.AccountingReviewChecked = true;
            }

            order.Status = OrderStatus.PendingDeputyDirector;
            order.AccountingApproverName = "Talab etilmaydi";
            order.ApprovedAt = DateTime.UtcNow;
        }
        else
        {
            foreach (var line in order.Lines)
            {
                line.AccountingStatus = LineAccountingStatuses.Pending;
                line.AccountantSigned = false;
                line.AccountingReviewChecked = null;
            }

            order.Status = OrderStatus.PendingAccounting;
        }

        order.SubmittedAt = DateTime.UtcNow;
        order.SubmittedById = userId;

        var submitter = await db.Users.FindAsync(userId);
        order.MarketingApproverName = submitter?.FullName ?? "";
        order.MarketingApprovedAt = DateTime.UtcNow;
        order.ApprovedByMarketingId = userId;

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> SaveAccountingReviewAsync(Guid id, SaveAccountingReviewRequest request)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (order.Status != OrderStatus.PendingAccounting)
            throw new ArgumentException("Buyurtma buxgalteriya kelishuvida emas");

        ApplyAccountingReviewSelections(order, request);

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> FinalizeAccountingReviewAsync(
        Guid id, Guid userId, SaveAccountingReviewRequest? review = null)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (review?.Selections is { Count: > 0 })
            ApplyAccountingReviewSelections(order, review);

        var approver = await db.Users.FindAsync(userId);
        var approverName = approver?.FullName ?? "";

        var contractorGroups = order.Lines
            .Where(l => l.MonthlyOrderId == order.Id)
            .GroupBy(l => l.Contractor)
            .ToList();

        if (contractorGroups.Count == 0)
            throw new ArgumentException("Kelishish uchun kontragent topilmadi");

        foreach (var group in contractorGroups)
        {
            var first = group.First();
            var isChecked = first.AccountingReviewChecked ?? (first.AccountingStatus == LineAccountingStatuses.Approved);
            foreach (var line in group)
            {
                if (isChecked)
                {
                    line.AccountingStatus = LineAccountingStatuses.Approved;
                    line.AccountantSigned = true;
                    line.AccountingReviewChecked = null;
                }
                else
                {
                    line.AccountingStatus = LineAccountingStatuses.Rejected;
                    line.AccountantSigned = false;
                    line.AccountingReviewChecked = null;
                }
            }
        }

        order.ApprovedByAccountingId = userId;
        order.ApprovedAt = DateTime.UtcNow;

        var orderLines = order.Lines.Where(l => l.MonthlyOrderId == order.Id).ToList();
        var hasRejected = orderLines.Any(l => l.AccountingStatus == LineAccountingStatuses.Rejected);
        var approvedLines = orderLines
            .Where(l => l.AccountingStatus == LineAccountingStatuses.Approved)
            .ToList();

        if (approvedLines.Count > 0)
            order.AccountingApproverName = approverName;

        // Buxgalteriya to‘liq kelishsa — marketingga qaytmasdan o‘rinbosarga
        if (approvedLines.Count > 0 && !hasRejected)
        {
            foreach (var line in approvedLines)
                line.AccountingStatus = LineAccountingStatuses.PendingDeputy;
        }

        RefreshOrderStatus(order);

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    private static List<MonthlyOrderLine> GetOrderLines(MonthlyOrder order) =>
        order.Lines.Where(l => l.MonthlyOrderId == order.Id).OrderBy(l => l.SortOrder).ToList();

    private static void ApplyAccountingReviewSelections(
        MonthlyOrder order, SaveAccountingReviewRequest request)
    {
        foreach (var selection in request.Selections)
        {
            var contractor = selection.Contractor.Trim();
            var lines = order.Lines
                .Where(l => l.MonthlyOrderId == order.Id
                    && l.Contractor == contractor)
                .ToList();

            if (lines.Count == 0) continue;

            foreach (var line in lines)
                line.AccountingReviewChecked = selection.Checked;
        }
    }

    public async Task<MonthlyOrderDto?> ResubmitRejectedToAccountingAsync(Guid id, Guid userId)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (order.Status != OrderStatus.ReturnedToMarketing)
            throw new ArgumentException("Faqat qaytarilgan buyurtmani qayta yuborish mumkin");

        if (order.Attachments.Count == 0)
            throw new ArgumentException("Ilova biriktirish majburiy — kamida bitta fayl qo‘shing");

        var rejected = order.Lines
            .Where(l => l.AccountingStatus == LineAccountingStatuses.Rejected)
            .ToList();

        if (rejected.Count == 0)
            throw new ArgumentException("Qayta yuborish uchun kontragent topilmadi");

        var isCondensate = order.ProductType.Contains("kondensat", StringComparison.OrdinalIgnoreCase);
        foreach (var line in rejected)
        {
            line.AccountingStatus = isCondensate ? LineAccountingStatuses.PendingDeputy : LineAccountingStatuses.Pending;
            line.AccountantSigned = isCondensate;
            line.AccountingReviewChecked = isCondensate ? true : null;
        }

        order.SubmittedAt = DateTime.UtcNow;
        order.SubmittedById = userId;

        var submitter = await db.Users.FindAsync(userId);
        order.MarketingApproverName = submitter?.FullName ?? "";
        order.MarketingApprovedAt = DateTime.UtcNow;
        order.ApprovedByMarketingId = userId;

        if (isCondensate)
        {
            order.AccountingApproverName = "Talab etilmaydi";
            order.ApprovedAt = DateTime.UtcNow;
        }

        RefreshOrderStatus(order);

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> SubmitToDispatchAsync(Guid id, Guid userId)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (order.Status != OrderStatus.ReadyForDispatch)
            throw new ArgumentException("Faqat buxgalteriya kelishgan buyurtmani tasdiqlash mumkin");

        var isCondensate = order.ProductType.Contains("kondensat", StringComparison.OrdinalIgnoreCase);
        if (!isCondensate && string.IsNullOrWhiteSpace(order.AccountingApproverName))
            throw new ArgumentException("Buxgalteriya tasdiqi topilmadi");

        var approver = await db.Users.FindAsync(userId);
        var approved = order.Lines
            .Where(l => l.AccountingStatus == LineAccountingStatuses.Approved)
            .ToList();

        if (approved.Count == 0)
            throw new ArgumentException("Bosh direktor o‘rinbosariga yuborish uchun kelishilgan kontragent yo'q");

        foreach (var line in approved)
            line.AccountingStatus = LineAccountingStatuses.PendingDeputy;

        order.MarketingApproverName = approver?.FullName ?? "";
        order.MarketingApprovedAt = DateTime.UtcNow;
        order.ApprovedByMarketingId = userId;
        order.SubmittedToDispatchAt = DateTime.UtcNow;
        order.SubmittedToDispatchById = userId;
        RefreshOrderStatus(order);

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> ApproveDeputyAsync(Guid id, Guid userId)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (order.Status != OrderStatus.PendingDeputyDirector)
            throw new ArgumentException("Buyurtma Bosh direktor o‘rinbosari tasdig‘ida emas");

        var isCondensate = order.ProductType.Contains("kondensat", StringComparison.OrdinalIgnoreCase);
        if (!isCondensate && string.IsNullOrWhiteSpace(order.AccountingApproverName))
            throw new ArgumentException("Buxgalteriya tasdiqi topilmadi");

        var approver = await db.Users.FindAsync(userId);
        var lines = order.Lines
            .Where(l => l.AccountingStatus == LineAccountingStatuses.PendingDeputy)
            .ToList();

        if (lines.Count == 0)
            throw new ArgumentException("Tasdiqlash uchun kontragent topilmadi");

        foreach (var line in lines)
            line.AccountingStatus = LineAccountingStatuses.PendingDispatch;

        order.DeputyApproverName = approver?.FullName ?? "";
        order.ApprovedByDeputyId = userId;
        order.DeputyApprovedAt = DateTime.UtcNow;
        RefreshOrderStatus(order);

        var pdfModel = BuildMonthlyOrderPdfModel(order);
        var pdfBytes = pdfGenerator.GenerateMonthlyOrderPdf(pdfModel);

        var qrDeputy = await qrLinkService.RegisterDocumentAsync(new QrLinkRegisterRequest(
            SourceDocumentId: order.OrderNumber,
            DocumentType: "Buyurtma",
            Title: $"Mahsulot yuklash buyurtmasi № {order.OrderNumber}",
            Status: "Approved",
            OwnerName: order.DeputyApproverName
        ), pdfBytes, $"Buyurtma_{order.OrderNumber}.pdf");
        order.QrGlobalId = qrDeputy.GlobalId;
        order.QrVerificationUrl = qrDeputy.VerificationUrl;
        order.QrCodeBase64 = qrDeputy.QrCodeBase64;
        order.QrRegisteredAt = qrDeputy.RegisteredAt;

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<MonthlyOrderDto?> ApproveDispatchAsync(Guid id, Guid userId)
    {
        var order = await LoadOrderAsync(id);
        if (order is null) return null;

        if (order.Status != OrderStatus.PendingDispatching)
            throw new ArgumentException("Buyurtma ICHDX ijroga qabulida emas");

        if (string.IsNullOrWhiteSpace(order.DeputyApproverName)
            && string.IsNullOrWhiteSpace(order.MarketingApproverName))
            throw new ArgumentException("Bosh direktor o‘rinbosari tasdiqi topilmadi");

        var approver = await db.Users.FindAsync(userId);
        var lines = order.Lines
            .Where(l => l.AccountingStatus == LineAccountingStatuses.PendingDispatch)
            .ToList();

        if (lines.Count == 0)
            throw new ArgumentException("Tasdiqlash uchun kontragent topilmadi");

        foreach (var line in lines)
            line.AccountingStatus = LineAccountingStatuses.DispatchApproved;

        order.DispatchApproverName = approver?.FullName ?? "";
        order.ApprovedByDispatchId = userId;
        order.DispatchApprovedAt = DateTime.UtcNow;
        RefreshOrderStatus(order);

        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var order = await db.MonthlyOrders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return false;

        if (order.Status is OrderStatus.Completed or OrderStatus.Cancelled)
            throw new ArgumentException("Yakunlangan yoki bekor qilingan buyurtmani o'chirib bo'lmaydi");

        var dailyPlans = await db.DailyPlans
            .Where(dp => dp.MonthlyOrderId == id)
            .ToListAsync();

        if (dailyPlans.Count > 0)
        {
            var planIds = dailyPlans.Select(dp => dp.Id).ToList();
            var shipments = await db.Shipments
                .Where(s => s.DailyPlanId.HasValue && planIds.Contains(s.DailyPlanId.Value))
                .ToListAsync();

            if (shipments.Count > 0)
            {
                var shipmentIds = shipments.Select(s => s.Id).ToList();
                var wagons = await db.Wagons
                    .Where(w => shipmentIds.Contains(w.ShipmentId))
                    .ToListAsync();

                if (wagons.Count > 0)
                {
                    var wagonIds = wagons.Select(w => w.Id).ToList();
                    var weighingRecords = await db.WeighingRecords
                        .Where(wr => wagonIds.Contains(wr.WagonId))
                        .ToListAsync();
                    if (weighingRecords.Count > 0)
                        db.WeighingRecords.RemoveRange(weighingRecords);

                    db.Wagons.RemoveRange(wagons);
                }

                var statusHistories = await db.ShipmentStatusHistories
                    .Where(sh => shipmentIds.Contains(sh.ShipmentId))
                    .ToListAsync();
                if (statusHistories.Count > 0)
                    db.ShipmentStatusHistories.RemoveRange(statusHistories);

                db.Shipments.RemoveRange(shipments);
            }

            db.DailyPlans.RemoveRange(dailyPlans);
        }

        db.MonthlyOrderLines.RemoveRange(order.Lines);
        db.MonthlyOrders.Remove(order);
        await db.SaveChangesAsync();
        return true;
    }

    private async Task<MonthlyOrder?> LoadOrderAsync(Guid id) =>
        await db.MonthlyOrders
            .Include(o => o.Lines)
            .Include(o => o.CreatedBy)
            .Include(o => o.Attachments).ThenInclude(a => a.UploadedBy)
            .FirstOrDefaultAsync(o => o.Id == id);

    private static bool IsSplitOrder(MonthlyOrder order) =>
        SplitOrderSuffix.IsMatch(order.OrderNumber);

    private static string GetRootOrderNumber(string orderNumber)
    {
        var match = RootOrderNumber.Match(orderNumber);
        return match.Success ? match.Groups[1].Value : orderNumber;
    }

    private async Task<MonthlyOrder?> MergeLinesIntoParentAsync(
        MonthlyOrder splitOrder,
        List<MonthlyOrderLine> linesToMerge,
        string approverName,
        Guid userId)
    {
        if (linesToMerge.Count == 0) return null;

        var rootNumber = GetRootOrderNumber(splitOrder.OrderNumber);
        var parent = await db.MonthlyOrders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.OrderNumber == rootNumber);

        if (parent is null) return null;

        var parentLines = parent.Lines.Where(l => l.MonthlyOrderId == parent.Id).ToList();
        var maxSort = parentLines.Count > 0 ? parentLines.Max(l => l.SortOrder) : 0;

        foreach (var line in linesToMerge)
        {
            line.MonthlyOrderId = parent.Id;
            line.SortOrder = ++maxSort;
        }

        parent.AccountingApproverName = approverName;
        parent.ApprovedByAccountingId = userId;
        parent.ApprovedAt = DateTime.UtcNow;
        ReindexLines(parent.Lines.Where(l => l.MonthlyOrderId == parent.Id).OrderBy(l => l.SortOrder).ToList());
        RefreshOrderStatus(parent);

        var remainingSplitLines = splitOrder.Lines.Where(l => l.MonthlyOrderId == splitOrder.Id).ToList();
        if (remainingSplitLines.Count == 0)
            db.MonthlyOrders.Remove(splitOrder);
        else
            ReindexLines(remainingSplitLines);

        return parent;
    }

    private async Task<MonthlyOrder> CreateReturnedSplitOrderAsync(
        MonthlyOrder source, List<MonthlyOrderLine> lines)
    {
        var returned = new MonthlyOrder
        {
            Id = Guid.NewGuid(),
            OrderNumber = await GenerateNextSplitOrderNumberAsync(source.OrderNumber),
            LogisticsType = source.LogisticsType,
            ContractNumber = source.ContractNumber,
            ProductType = source.ProductType,
            Year = source.Year,
            Month = source.Month,
            Deadline = source.Deadline,
            Status = OrderStatus.ReturnedToMarketing,
            CreatedById = source.CreatedById,
        };

        db.MonthlyOrders.Add(returned);

        var sortOrder = 0;
        foreach (var line in lines.OrderBy(l => l.SortOrder))
        {
            line.MonthlyOrderId = returned.Id;
            line.SortOrder = ++sortOrder;
        }

        return returned;
    }

    private static void ApplyApprovedLines(IEnumerable<MonthlyOrderLine> lines)
    {
        foreach (var line in lines)
        {
            line.AccountingStatus = LineAccountingStatuses.Approved;
            line.AccountantSigned = true;
            line.AccountingReviewChecked = null;
        }
    }

    private static void ApplyRejectedLines(IEnumerable<MonthlyOrderLine> lines)
    {
        foreach (var line in lines)
        {
            line.AccountingStatus = LineAccountingStatuses.Rejected;
            line.AccountantSigned = false;
            line.AccountingReviewChecked = null;
        }
    }

    private static void ReindexLines(List<MonthlyOrderLine> lines)
    {
        var sorted = lines.OrderBy(l => l.SortOrder).ToList();
        for (var i = 0; i < sorted.Count; i++)
            sorted[i].SortOrder = i + 1;
    }

    private void SyncDraftLines(MonthlyOrder order, List<MonthlyOrderLineInput> inputs)
    {
        var existingById = order.Lines.ToDictionary(l => l.Id);
        var keptIds = new HashSet<Guid>();
        var ordered = inputs.OrderBy(l => l.SortOrder).ToList();

        for (var i = 0; i < ordered.Count; i++)
        {
            var input = ordered[i];
            var sortOrder = i + 1;

            if (input.Id is Guid existingId && existingById.TryGetValue(existingId, out var existing))
            {
                existing.SortOrder = sortOrder;
                existing.Contractor = input.Contractor.Trim();
                existing.WagonCount = input.WagonCount;
                existing.TonCount = Math.Max(0, input.TonCount);
                existing.QuantityUnit = OrderQuantityUnits.Normalize(input.QuantityUnit);
                existing.WagonNumbers = input.WagonNumbers?.Trim() ?? "";
                existing.DestinationStation = input.DestinationStation.Trim();
                existing.LastLoadingDate = ToUtcDate(input.LastLoadingDate);
                keptIds.Add(existing.Id);
                continue;
            }

            var created = new MonthlyOrderLine
            {
                Id = Guid.NewGuid(),
                MonthlyOrderId = order.Id,
                SortOrder = sortOrder,
                Contractor = input.Contractor.Trim(),
                WagonCount = input.WagonCount,
                TonCount = Math.Max(0, input.TonCount),
                QuantityUnit = OrderQuantityUnits.Normalize(input.QuantityUnit),
                WagonNumbers = input.WagonNumbers?.Trim() ?? "",
                DestinationStation = input.DestinationStation.Trim(),
                LastLoadingDate = ToUtcDate(input.LastLoadingDate),
                AccountingStatus = LineAccountingStatuses.Pending,
            };
            order.Lines.Add(created);
            db.MonthlyOrderLines.Add(created);
            keptIds.Add(created.Id);
        }

        var toRemove = order.Lines.Where(l => !keptIds.Contains(l.Id)).ToList();
        if (toRemove.Count > 0)
            db.MonthlyOrderLines.RemoveRange(toRemove);
    }

    private static void UpdateReturnedLines(MonthlyOrder order, List<MonthlyOrderLineInput> inputs)
    {
        var existingById = order.Lines.ToDictionary(l => l.Id);
        var orderedInputs = inputs.OrderBy(l => l.SortOrder).ToList();

        foreach (var input in orderedInputs)
        {
            if (input.Id is null || !existingById.TryGetValue(input.Id.Value, out var line))
                throw new ArgumentException("Qaytarilgan qator identifikatori noto'g'ri");

            if (line.AccountingStatus != LineAccountingStatuses.Rejected)
                continue;

            line.SortOrder = input.SortOrder;
            line.Contractor = input.Contractor.Trim();
            line.WagonCount = input.WagonCount;
            line.TonCount = Math.Max(0, input.TonCount);
            line.QuantityUnit = OrderQuantityUnits.Normalize(input.QuantityUnit);
            line.WagonNumbers = input.WagonNumbers?.Trim() ?? "";
            line.DestinationStation = input.DestinationStation.Trim();
            line.LastLoadingDate = ToUtcDate(input.LastLoadingDate);
        }
    }

    private static void RefreshOrderStatus(MonthlyOrder order)
    {
        var lines = order.Lines.Where(l => l.MonthlyOrderId == order.Id).ToList();
        if (lines.Count == 0) return;

        if (lines.All(l => l.AccountingStatus == LineAccountingStatuses.DispatchApproved))
        {
            order.Status = OrderStatus.Active;
            OrderFulfillment.RefreshStatus(order);
            return;
        }

        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.PendingDispatch))
        {
            order.Status = OrderStatus.PendingDispatching;
            return;
        }

        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.PendingDeputy))
        {
            order.Status = OrderStatus.PendingDeputyDirector;
            return;
        }

        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.Rejected))
        {
            order.Status = OrderStatus.ReturnedToMarketing;
            return;
        }

        if (lines.All(l => l.AccountingStatus == LineAccountingStatuses.Approved))
        {
            order.Status = OrderStatus.ReadyForDispatch;
            return;
        }

        order.Status = OrderStatus.PendingAccounting;
    }

    private async Task ValidateRequestAsync(
        string logisticsType,
        string productType,
        string productGrade,
        string contractNumber,
        List<MonthlyOrderLineInput> lines,
        Guid userId)
    {
        if (!LogisticsTypes.IsValid(logisticsType))
            throw new ArgumentException("Noto'g'ri logistika turi");

        var user = await db.Users.FindAsync(userId);
        var isCondensate = productType.Contains("kondensat", StringComparison.OrdinalIgnoreCase);

        if (user?.Role == UserRoles.Marketing && isCondensate)
            throw new ArgumentException("Marketing xodimi «Tabiiy gaz kondensati» mahsulotini kirita olmaydi. Ushbu mahsulot faqat IChDX boshlig‘i tomonidan kiritiladi.");

        if (user?.Role == UserRoles.DispatchSupervisor && !isCondensate)
            throw new ArgumentException("IChDX boshlig‘i faqat «Tabiiy gaz kondensati» mahsulotini kiritishi mumkin. Boshqa mahsulotlar Marketing bo‘limi tomonidan kiritiladi.");

        var isPe = productType.Contains("polietilen", StringComparison.OrdinalIgnoreCase)
            || productType.Contains("полиэтилен", StringComparison.OrdinalIgnoreCase);
        if (isPe && string.IsNullOrWhiteSpace(productGrade))
            throw new ArgumentException("Polietilen mahsuloti uchun markani kiritish majburiy (ShGKMda har xil turdagi polietilen ishlab chiqariladi)");

        var productExists = await db.CatalogProducts.AnyAsync(p =>
            p.LogisticsType == logisticsType
            && p.Name == productType
            && p.IsActive);
        if (!productExists)
            throw new ArgumentException("Noto'g'ri mahsulot turi — avval Admin ma'lumotnomasiga qo'shing");

        if (lines.Count == 0)
            throw new ArgumentException("Kamida bitta qator kiritilishi kerak");
        if (lines.Any(l => string.IsNullOrWhiteSpace(l.Contractor)))
            throw new ArgumentException("Korxona nomi bo'sh bo'lmasligi kerak");

        var isBlankOrEmergencyOrder = !string.IsNullOrWhiteSpace(contractNumber)
            && (contractNumber.Contains("ZAXIRA", StringComparison.OrdinalIgnoreCase)
                || contractNumber.Contains("BO'SH", StringComparison.OrdinalIgnoreCase)
                || contractNumber.Contains("BOSH", StringComparison.OrdinalIgnoreCase)
                || contractNumber.Contains("FAVQULODDA", StringComparison.OrdinalIgnoreCase));

        // Tonna majburiy (oddiy buyurtmada > 0 bo'lishi shart, zaxira/bo'sh buyurtmada 0 bo'lishi mumkin)
        if (!isBlankOrEmergencyOrder && lines.Any(l => l.TonCount <= 0))
            throw new ArgumentException("Mahsulot og'irligi (tonna) kiritilishi shart (0 dan katta bo'lishi kerak)");

        // Vagon soni ixtiyoriy (0 yoki undan katta bo'lishi mumkin)
        if (lines.Any(l => l.WagonCount < 0))
            throw new ArgumentException("Vagon soni manfiy bo'lishi mumkin emas");

        if (lines.Any(l => !OrderQuantityUnits.IsValid(l.QuantityUnit)))
            throw new ArgumentException("Noto'g'ri o'lchov birligi");
        if (lines.Any(l => string.IsNullOrWhiteSpace(l.DestinationStation)))
            throw new ArgumentException("Yetkazib berish manzili kiritilishi kerak");
    }

    private async Task<string> GenerateNextOrderNumberAsync(string logisticsType, string productType)
    {
        return await numberingService.GenerateOrderNumberAsync(logisticsType, productType);
    }

    private async Task<string> GenerateNextSplitOrderNumberAsync(string sourceOrderNumber)
    {
        var splitPrefix = $"{sourceOrderNumber}-M";

        var orderNumbers = await db.MonthlyOrders
            .AsNoTracking()
            .Where(o => o.OrderNumber.StartsWith(splitPrefix))
            .Select(o => o.OrderNumber)
            .ToListAsync();

        var maxSequence = orderNumbers
            .Select(number => ParseOrderSequence(number, splitPrefix))
            .DefaultIfEmpty(0)
            .Max();

        return $"{splitPrefix}{maxSequence + 1:D2}";
    }

    private static int ParseOrderSequence(string orderNumber, string prefix)
    {
        if (!orderNumber.StartsWith(prefix, StringComparison.Ordinal))
            return 0;

        var suffix = orderNumber[prefix.Length..];
        var splitIndex = suffix.IndexOf('-', StringComparison.Ordinal);
        if (splitIndex >= 0)
            suffix = suffix[..splitIndex];

        return int.TryParse(suffix, out var value) ? value : 0;
    }

    private static List<MonthlyOrderLine> MapLines(List<MonthlyOrderLineInput> lines) =>
        lines
            .OrderBy(l => l.SortOrder)
            .Select((l, i) => new MonthlyOrderLine
            {
                SortOrder = i + 1,
                Contractor = l.Contractor.Trim(),
                WagonCount = l.WagonCount,
                TonCount = Math.Max(0, l.TonCount),
                QuantityUnit = OrderQuantityUnits.Normalize(l.QuantityUnit),
                WagonNumbers = l.WagonNumbers?.Trim() ?? "",
                DestinationStation = l.DestinationStation.Trim(),
                LastLoadingDate = ToUtcDate(l.LastLoadingDate),
                AccountingStatus = LineAccountingStatuses.Pending,
            })
            .ToList();

    private static DateTime ToUtcDate(DateTime value) =>
        DateTime.SpecifyKind(value.Date, DateTimeKind.Utc);

    private static DateTime? ToUtcDate(DateTime? value) =>
        value.HasValue ? ToUtcDate(value.Value) : null;

    private static MonthlyOrderDto ToDto(MonthlyOrder o)
    {
        var lines = o.Lines
            .Where(l => l.MonthlyOrderId == o.Id)
            .OrderBy(l => l.SortOrder)
            .ToList();
        var attachments = (o.Attachments ?? [])
            .OrderByDescending(a => a.UploadedAt)
            .Select(a => new OrderAttachmentDto(
                a.Id,
                a.FileName,
                a.ContentType,
                a.SizeBytes,
                a.UploadedAt,
                a.UploadedBy?.FullName ?? ""))
            .ToList();
        return new MonthlyOrderDto(
            o.Id, o.OrderNumber, o.LogisticsType, o.ContractNumber, o.ProductType,
            o.Year, o.Month, o.Deadline, o.Status.ToString(),
            o.CreatedBy?.FullName ?? "", o.CreatedAt,
            o.AccountingApproverName,
            o.MarketingApproverName,
            o.DispatchApproverName,
            lines.Select(l =>
            {
                var orderedWagons = ResolveWagonCount(l);
                var orderedTons = ResolveTonCount(l);
                return new MonthlyOrderLineDto(
                    l.Id, l.SortOrder, l.Contractor,
                    orderedWagons,
                    orderedTons, l.WagonNumbers,
                    l.DestinationStation, l.LastLoadingDate, l.AccountantSigned, l.WeigherSigned,
                    OrderQuantityUnits.Normalize(l.QuantityUnit),
                    LineAccountingStatuses.Normalize(l.AccountingStatus),
                    l.AccountingReviewChecked,
                    l.FulfilledWagonCount,
                    l.FulfilledNetWeight,
                    Math.Max(0, orderedWagons - l.FulfilledWagonCount),
                    Math.Max(0, orderedTons - l.FulfilledNetWeight)
                );
            }).ToList(),
            lines.Sum(ResolveWagonCount),
            lines.Sum(ResolveTonCount),
            attachments,
            o.SubmittedAt,
            o.ApprovedAt,
            o.SubmittedToDispatchAt,
            o.DispatchApprovedAt,
            o.MarketingApprovedAt,
            o.DeputyApproverName,
            o.DeputyApprovedAt,
            o.QrGlobalId ?? string.Empty,
            o.QrVerificationUrl ?? string.Empty,
            o.QrCodeBase64 ?? string.Empty,
            o.QrRegisteredAt,
            o.ProductGrade ?? string.Empty);
    }

    public static MonthlyOrderPdfModel BuildMonthlyOrderPdfModel(MonthlyOrder order)
    {
        var lineRows = new List<MonthlyOrderPdfLineRow>();
        int idx = 1;
        foreach (var line in (order.Lines ?? []).OrderBy(l => l.SortOrder))
        {
            var wagons = ResolveWagonCount(line);
            var tons = ResolveTonCount(line);
            lineRows.Add(new MonthlyOrderPdfLineRow(
                Index: idx++,
                Contractor: line.Contractor,
                WagonCount: wagons,
                TonCount: (decimal)tons,
                ContractNumber: order.ContractNumber,
                DestinationStation: line.DestinationStation
            ));
        }

        var totalWagons = lineRows.Sum(l => l.WagonCount);
        var totalTons = lineRows.Sum(l => l.TonCount);

        var approvedAt = order.DispatchApprovedAt
            ?? order.DeputyApprovedAt
            ?? order.ApprovedAt
            ?? order.MarketingApprovedAt;

        return new MonthlyOrderPdfModel(
            OrderNumber: order.OrderNumber,
            ProductType: !string.IsNullOrWhiteSpace(order.ProductGrade) ? $"{order.ProductType} ({order.ProductGrade})" : order.ProductType,
            Status: order.Status.ToString(),
            ApprovedAt: approvedAt,
            DeputyApproverName: order.DeputyApproverName,
            DeputyApprovedAt: order.DeputyApprovedAt,
            MarketingApproverName: order.MarketingApproverName ?? order.CreatedBy?.FullName,
            MarketingApprovedAt: order.CreatedAt,
            AccountingApproverName: order.AccountingApproverName,
            AccountingApprovedAt: order.ApprovedAt,
            QrVerificationUrl: order.QrVerificationUrl,
            QrGlobalId: order.QrGlobalId,
            ContractNumber: order.ContractNumber,
            Lines: lineRows,
            TotalWagons: totalWagons,
            TotalTons: totalTons
        );
    }

    private static int ResolveWagonCount(MonthlyOrderLine l) =>
        OrderQuantityUnits.Normalize(l.QuantityUnit) == OrderQuantityUnits.Ton && l.TonCount <= 0
            ? 0
            : l.WagonCount;

    private static decimal ResolveTonCount(MonthlyOrderLine l)
    {
        if (l.TonCount > 0) return l.TonCount;
        if (OrderQuantityUnits.Normalize(l.QuantityUnit) == OrderQuantityUnits.Ton)
            return (decimal)l.WagonCount;
        return 0m;
    }
}
