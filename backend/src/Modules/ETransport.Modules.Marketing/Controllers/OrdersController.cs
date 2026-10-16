using System.Security.Claims;
using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Identity;
using ETransport.Infrastructure.Storage;
using ETransport.Modules.Marketing.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using ETransport.Infrastructure.Pdf;

namespace ETransport.Modules.Marketing.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrdersController(
    IOrderService orderService,
    IRbacService rbacService,
    AppDbContext db,
    IFileStorageService fileStorage,
    IDocumentPdfGenerator pdfGenerator) : ControllerBase
{
    private const long MaxAttachmentBytes = 20 * 1024 * 1024;
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".zip", ".rar",
    };

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<MonthlyOrderDto>>>> GetAll([FromQuery] string? logisticsType) =>
        Ok(new ApiResponse<List<MonthlyOrderDto>>(true, await orderService.GetAllAsync(logisticsType)));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> GetById(Guid id)
    {
        var order = await orderService.GetByIdAsync(id);
        if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
        return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
    }

    [HttpGet("{id:guid}/edit-history")]
    public async Task<ActionResult<ApiResponse<object>>> GetEditHistory(Guid id)
    {
        var rows = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == nameof(MonthlyOrder)
                && a.EntityId == id.ToString()
                && a.Action == "OrderEdited")
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new { a.Id, a.UserId, a.Details, a.CreatedAt })
            .ToListAsync();
        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).Distinct().ToList();
        var users = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);
        var result = rows.Select(r => new
        {
            r.Id,
            EditorName = r.UserId.HasValue && users.TryGetValue(r.UserId.Value, out var name) ? name : "Noma’lum foydalanuvchi",
            r.Details,
            r.CreatedAt,
        });
        return Ok(new ApiResponse<object>(true, result));
    }

    [HttpPost]
    [RequirePermission("orders.create")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> Create([FromBody] CreateMonthlyOrderRequest request)
    {
        try
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            if (!await rbacService.HasActionAsync(role, "orders.create"))
                return Forbid();

            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.CreateAsync(request, userId);
            return CreatedAtAction(nameof(GetById), new { id = order.Id }, new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
        catch (DbUpdateException)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtmani saqlab bo'lmadi. Ma'lumotlarni tekshirib qayta urinib ko'ring."));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("orders.update")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> Update(Guid id, [FromBody] UpdateMonthlyOrderRequest request)
    {
        try
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            if (!await rbacService.HasActionAsync(role, "orders.update"))
                return Forbid();

            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.UpdateAsync(id, request, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
        catch (DbUpdateException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(
                false,
                null,
                ex.InnerException?.Message ?? "Buyurtmani saqlab bo'lmadi. Ma'lumotlarni tekshirib qayta urinib ko'ring."));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        try
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            if (!await rbacService.HasActionAsync(role, "orders.delete"))
                return Forbid();

            var order = await db.MonthlyOrders
                .Include(o => o.Lines)
                .Include(o => o.Attachments)
                .FirstOrDefaultAsync(o => o.Id == id);
            if (order is null) return NotFound(new ApiResponse<object>(false, null, "Buyurtma topilmadi"));

            if (order.Status is OrderStatus.Completed or OrderStatus.Cancelled)
                return BadRequest(new ApiResponse<object>(false, null, "Yakunlangan yoki bekor qilingan buyurtmani o'chirib bo'lmaydi"));

            var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "Marketing";
            var fullName = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Noma'lum";
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            Guid.TryParse(userIdStr, out var currentUserId);

            var trashPayload = new
            {
                Order = new
                {
                    order.Id,
                    order.OrderNumber,
                    order.Year,
                    order.Month,
                    order.LogisticsType,
                    order.ContractNumber,
                    order.ProductType,
                    order.Deadline,
                    order.Status,
                    order.CreatedById,
                    order.CreatedAt,
                    order.SubmittedAt,
                    order.SubmittedById,
                    order.ApprovedAt,
                    order.ApprovedByAccountingId,
                    order.AccountingApproverName,
                    order.MarketingApprovedAt,
                    order.ApprovedByMarketingId,
                    order.MarketingApproverName,
                    order.SubmittedToDispatchAt,
                    order.SubmittedToDispatchById,
                    order.DispatchApprovedAt,
                    order.ApprovedByDispatchId,
                    order.DispatchApproverName,
                    order.DeputyApprovedAt,
                    order.ApprovedByDeputyId,
                    order.DeputyApproverName,
                    order.QrGlobalId,
                    order.QrVerificationUrl,
                    order.QrCodeBase64,
                    order.QrRegisteredAt
                },
                Lines = order.Lines.Select(l => new
                {
                    l.Id,
                    l.MonthlyOrderId,
                    l.SortOrder,
                    l.Contractor,
                    l.WagonCount,
                    l.TonCount,
                    l.QuantityUnit,
                    l.DestinationStation,
                    l.AccountingStatus
                }).ToList(),
                Attachments = order.Attachments.Select(a => new
                {
                    a.Id,
                    a.FileName,
                    a.ContentType,
                    a.SizeBytes,
                    a.ObjectKey,
                    a.UploadedAt
                }).ToList()
            };

            var trashItem = new RecycleBinItem
            {
                Id = Guid.NewGuid(),
                EntityType = "MonthlyOrder",
                EntityId = order.Id,
                Title = $"Buyurtma № {order.OrderNumber} — {order.ProductType}",
                Category = "order",
                RelatedNumber = order.OrderNumber ?? string.Empty,
                FileName = string.Empty,
                ContentType = string.Empty,
                SizeBytes = 0,
                ObjectKey = string.Empty,
                DeletedById = currentUserId,
                DeletedByName = fullName,
                DeletedByRole = currentRole,
                DeletedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddDays(30),
                DeleteReason = "Oylik buyurtma o‘chirildi",
                PayloadJson = JsonSerializer.Serialize(trashPayload)
            };
            db.RecycleBinItems.Add(trashItem);

            var deleted = await orderService.DeleteAsync(id);
            if (!deleted) return NotFound(new ApiResponse<object>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<object>(true, null));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    [HttpGet("{id:guid}/attachments")]
    public async Task<ActionResult<ApiResponse<List<OrderAttachmentDto>>>> ListAttachments(Guid id)
    {
        var exists = await db.MonthlyOrders.AnyAsync(o => o.Id == id);
        if (!exists) return NotFound(new ApiResponse<List<OrderAttachmentDto>>(false, null, "Buyurtma topilmadi"));

        var items = await db.OrderAttachments
            .AsNoTracking()
            .Include(a => a.UploadedBy)
            .Where(a => a.MonthlyOrderId == id)
            .OrderByDescending(a => a.UploadedAt)
            .Select(a => new OrderAttachmentDto(
                a.Id,
                a.FileName,
                a.ContentType,
                a.SizeBytes,
                a.UploadedAt,
                a.UploadedBy != null ? a.UploadedBy.FullName : ""))
            .ToListAsync();

        return Ok(new ApiResponse<List<OrderAttachmentDto>>(true, items));
    }

    [HttpPost("{id:guid}/attachments")]
    [RequirePermission("orders.update")]
    [RequestSizeLimit(MaxAttachmentBytes + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAttachmentBytes + 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<OrderAttachmentDto>>> UploadAttachment(Guid id, IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new ApiResponse<OrderAttachmentDto>(false, null, "Fayl tanlanmagan"));

        if (file.Length > MaxAttachmentBytes)
            return BadRequest(new ApiResponse<OrderAttachmentDto>(false, null, "Fayl hajmi 20 MB dan oshmasligi kerak"));

        var ext = Path.GetExtension(file.FileName ?? "");
        if (string.IsNullOrWhiteSpace(ext) || !AllowedExtensions.Contains(ext))
            return BadRequest(new ApiResponse<OrderAttachmentDto>(false, null, "Ruxsat etilmagan fayl turi"));

        var order = await db.MonthlyOrders.FirstOrDefaultAsync(o => o.Id == id);
        if (order is null)
            return NotFound(new ApiResponse<OrderAttachmentDto>(false, null, "Buyurtma topilmadi"));

        // Qo‘shimcha ilova tahrirlashda ham qo‘shiladi; faqat yopilgan buyurtmaga qo‘shib bo‘lmaydi.
        // (O‘chirish esa avvalgidek faqat qoralama/qaytarilgan buyurtmada — tasdiqlangan hujjat saqlanadi.)
        if (order.Status is OrderStatus.Completed or OrderStatus.Cancelled)
            return BadRequest(new ApiResponse<OrderAttachmentDto>(false, null, "Yakunlangan yoki bekor qilingan buyurtmaga ilova qo'shib bo'lmaydi"));
        if (IsStaffLocked(order))
            return BadRequest(new ApiResponse<OrderAttachmentDto>(false, null, StaffLockedMessage));

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await using var stream = file.OpenReadStream();
        var objectKey = await fileStorage.UploadAsync(stream, file.FileName, file.ContentType ?? "application/octet-stream");

        var attachment = new OrderAttachment
        {
            MonthlyOrderId = id,
            FileName = Path.GetFileName(file.FileName),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            SizeBytes = file.Length,
            ObjectKey = objectKey,
            UploadedById = userId,
            UploadedAt = DateTime.UtcNow,
        };

        db.OrderAttachments.Add(attachment);
        await db.SaveChangesAsync();
        await db.Entry(attachment).Reference(a => a.UploadedBy).LoadAsync();

        return Ok(new ApiResponse<OrderAttachmentDto>(true, new OrderAttachmentDto(
            attachment.Id,
            attachment.FileName,
            attachment.ContentType,
            attachment.SizeBytes,
            attachment.UploadedAt,
            attachment.UploadedBy?.FullName ?? "")));
    }

    [HttpGet("{id:guid}/attachments/{attachmentId:guid}/download")]
    public async Task<IActionResult> DownloadAttachment(Guid id, Guid attachmentId)
    {
        var attachment = await db.OrderAttachments
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.MonthlyOrderId == id);
        if (attachment is null) return NotFound();

        var stream = await fileStorage.DownloadAsync(attachment.ObjectKey);
        if (stream is null)
        {
            stream = await fileStorage.DownloadAsync(attachment.FileName);
        }

        if (stream is null)
        {
            var fallback = GeneratePlaceholderBytes(attachment.FileName, attachment.ContentType);
            return File(fallback, attachment.ContentType, attachment.FileName);
        }

        return File(stream, attachment.ContentType, attachment.FileName);
    }

    private static byte[] GeneratePlaceholderBytes(string fileName, string contentType)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext is ".jpg" or ".jpeg" || contentType.Contains("jpeg", StringComparison.OrdinalIgnoreCase))
        {
            return new byte[]
            {
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
                0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
                0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
                0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
                0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
                0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
                0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
                0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
                0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
                0x00, 0xBF, 0x80, 0xFF, 0xD9
            };
        }

        if (ext is ".png" || contentType.Contains("png", StringComparison.OrdinalIgnoreCase))
        {
            return Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
        }

        if (ext is ".pdf" || contentType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdfStr = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n200\n%%EOF";
            return System.Text.Encoding.UTF8.GetBytes(pdfStr);
        }

        var text = $"E-Transport ilova hujjati: {fileName}\nYuklangan sana: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n";
        return System.Text.Encoding.UTF8.GetBytes(text);
    }

    [HttpDelete("{id:guid}/attachments/{attachmentId:guid}")]
    [RequirePermission("orders.update")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteAttachment(Guid id, Guid attachmentId)
    {
        var attachment = await db.OrderAttachments
            .Include(a => a.MonthlyOrder)
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.MonthlyOrderId == id);
        if (attachment is null)
            return NotFound(new ApiResponse<object>(false, null, "Ilova topilmadi"));

        var order = attachment.MonthlyOrder;
        if (order is null || order.Status is not (OrderStatus.Draft or OrderStatus.ReturnedToMarketing))
            return BadRequest(new ApiResponse<object>(false, null, "Faqat qoralama yoki qaytarilgan buyurtmadan ilovani o'chirish mumkin"));
        if (IsStaffLocked(order))
            return BadRequest(new ApiResponse<object>(false, null, StaffLockedMessage));

        var objectKey = attachment.ObjectKey;
        var role = User.FindFirstValue(ClaimTypes.Role) ?? "Marketing";
        var username = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Noma'lum";
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid.TryParse(userIdStr, out var currentUserId);

        var trashItem = new RecycleBinItem
        {
            Id = Guid.NewGuid(),
            EntityType = "OrderAttachment",
            EntityId = attachment.Id,
            Title = attachment.FileName,
            Category = "attachment",
            RelatedNumber = order.OrderNumber ?? string.Empty,
            FileName = attachment.FileName,
            ContentType = attachment.ContentType,
            SizeBytes = attachment.SizeBytes,
            ObjectKey = attachment.ObjectKey,
            DeletedById = currentUserId,
            DeletedByName = username,
            DeletedByRole = role,
            DeletedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            DeleteReason = $"Buyurtma ilovasi o‘chirildi (№ {order.OrderNumber})",
            PayloadJson = JsonSerializer.Serialize(new
            {
                attachment.Id,
                attachment.MonthlyOrderId,
                attachment.FileName,
                attachment.ContentType,
                attachment.SizeBytes,
                attachment.ObjectKey,
                attachment.UploadedById,
                attachment.UploadedAt
            })
        };

        db.RecycleBinItems.Add(trashItem);
        db.OrderAttachments.Remove(attachment);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, null, "Ilova o'chirildi va Korzinaga yuborildi"));
    }

    [HttpPost("{id:guid}/submit-for-approval")]
    [RequirePermission("orders.submit-approval")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> SubmitForApproval(Guid id)
    {
        try
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            if (!await rbacService.HasActionAsync(role, "orders.submit-approval"))
                return Forbid();

            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.SubmitForAccountingAsync(id, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/resubmit-rejected")]
    [RequirePermission("orders.resubmit")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> ResubmitRejected(Guid id)
    {
        try
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            if (!await rbacService.HasActionAsync(role, "orders.resubmit"))
                return Forbid();

            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.ResubmitRejectedToAccountingAsync(id, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/save-accounting-review")]
    [RequirePermission("orders.accounting-save")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> SaveAccountingReview(
        Guid id, [FromBody] SaveAccountingReviewRequest request)
    {
        try
        {
            var order = await orderService.SaveAccountingReviewAsync(id, request);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/finalize-accounting-review")]
    [RequirePermission("orders.accounting-finalize")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> FinalizeAccountingReview(
        Guid id, [FromBody] SaveAccountingReviewRequest? request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.FinalizeAccountingReviewAsync(id, userId, request);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/submit-to-dispatch")]
    [RequirePermission("orders.submit-dispatch")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> SubmitToDispatch(Guid id)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.SubmitToDispatchAsync(id, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/approve-deputy")]
    [RequirePermission("orders.approve-deputy")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> ApproveDeputy(Guid id)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.ApproveDeputyAsync(id, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/approve-dispatch")]
    [RequirePermission("orders.approve-dispatch")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> ApproveDispatch(Guid id)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.ApproveDispatchAsync(id, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    private const string StaffLockedMessage = "Buyurtma bo‘lim boshlig‘ida yoki kelishuvda — xodim o‘zgartira olmaydi";

    /// <summary>MS va MX xodimi faqat bo'lim boshlig'iga yuborilmagan qoralamani o'zgartiradi.</summary>
    private bool IsStaffLocked(MonthlyOrder order) =>
        User.IsInRole(UserRoles.MarketingStaff)
        && (order.Status != OrderStatus.Draft || order.HeadReviewStatus == "Pending");

    /// <summary>MS va MX xodimi: buyurtmani bo'lim boshlig'iga yuborish.</summary>
    [HttpPost("{id:guid}/submit-to-head")]
    [RequirePermission("orders.submit-head")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> SubmitToHead(Guid id)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.SubmitToHeadAsync(id, userId);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order, "Buyurtma bo‘lim boshlig‘iga yuborildi"));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    /// <summary>MS va MX bo'lim boshlig'i: buyurtmani izoh bilan xodimga qaytarish.</summary>
    [HttpPost("{id:guid}/return-to-staff")]
    [RequirePermission("orders.approve-head")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> ReturnToStaff(Guid id, [FromBody] ReturnToStaffRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.ReturnToStaffAsync(id, userId, request.Comment);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order, "Buyurtma xodimga qaytarildi"));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpPost("{id:guid}/complete")]
    [RequirePermission("orders.update")]
    public async Task<ActionResult<ApiResponse<MonthlyOrderDto>>> CompleteManually(Guid id, [FromBody] CompleteOrderRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var order = await orderService.CompleteManuallyAsync(id, userId, request.Reason);
            if (order is null) return NotFound(new ApiResponse<MonthlyOrderDto>(false, null, "Buyurtma topilmadi"));
            return Ok(new ApiResponse<MonthlyOrderDto>(true, order));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<MonthlyOrderDto>(false, null, ex.Message));
        }
    }

    [HttpGet("{id:guid}/pdf")]
    [AllowAnonymous]
    public async Task<IActionResult> GetOrderPdf(Guid id)
    {
        var order = await db.MonthlyOrders
            .Include(o => o.CreatedBy)
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound("Buyurtma topilmadi");

        var pdfModel = OrderService.BuildMonthlyOrderPdfModel(order);
        var pdfBytes = pdfGenerator.GenerateMonthlyOrderPdf(pdfModel);
        return File(pdfBytes, "application/pdf", $"Buyurtma_{order.OrderNumber}.pdf");
    }

    [HttpGet("number/{orderNumber}/pdf")]
    [AllowAnonymous]
    public async Task<IActionResult> GetOrderPdfByNumber(string orderNumber)
    {
        var order = await db.MonthlyOrders
            .Include(o => o.CreatedBy)
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.OrderNumber == orderNumber.Trim());
        if (order is null) return NotFound("Buyurtma topilmadi");

        var pdfModel = OrderService.BuildMonthlyOrderPdfModel(order);
        var pdfBytes = pdfGenerator.GenerateMonthlyOrderPdf(pdfModel);
        return File(pdfBytes, "application/pdf", $"Buyurtma_{order.OrderNumber}.pdf");
    }
}
