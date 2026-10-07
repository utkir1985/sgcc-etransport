using System.Text;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Audit.Controllers;

public record AuditLogDto(
    Guid Id,
    Guid? UserId,
    string Username,
    string UserFullName,
    string UserRole,
    string UserPosition,
    string UserDepartment,
    string IpAddress,
    string UserAgent,
    string Action,
    string Category,
    string Status,
    string EntityType,
    string EntityId,
    string Details,
    DateTime CreatedAt
);

public record AuditLogPageResponse(
    List<AuditLogDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

public record AuditStatsDto(
    int TotalLogs,
    int SuccessCount,
    int WarningCount,
    int FailedCount,
    int AuthCount = 0,
    int OrderCount = 0,
    int WeighingCount = 0,
    int LoadingCount = 0,
    int DocumentsCount = 0,
    int IntakeCount = 0,
    string TotalTrend = "-75%",
    string SuccessTrend = "-75%",
    string WarningTrend = "+0%",
    string FailedTrend = "+0%"
);

[ApiController]
[Route("api/audit-logs")]
[Authorize]
public class AuditController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<AuditLogPageResponse>>> GetLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? tab = null,
        [FromQuery] string? search = null,
        [FromQuery] string? category = null,
        [FromQuery] string? status = null,
        [FromQuery] string? action = null,
        [FromQuery] string? username = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] string? ipAddress = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 5, 200);

        var query = db.AuditLogs.AsNoTracking().AsQueryable();

        // Tab filter
        if (string.Equals(tab, "logins", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "auth", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "entries", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "kirish", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.Category == "Auth" || x.Action.Contains("Login") || x.Action.Contains("Password"));
        }
        else if (string.Equals(tab, "changes", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "orders", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "loads", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "yuklash", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.Category == "Order" || x.Category == "Operations" || x.Action.Contains("Order") || x.Action.Contains("Yuklash") || x.Action.Contains("Edit") || x.Action.Contains("Update"));
        }
        else if (string.Equals(tab, "weighing", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "exits", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "chiqish", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.Category == "Weighing" || x.Category == "Security" || x.Action.Contains("Weigh") || x.Action.Contains("Tare") || x.Action.Contains("Gross") || x.Action.Contains("Chiqish"));
        }
        else if (string.Equals(tab, "defects", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "failed", StringComparison.OrdinalIgnoreCase) || string.Equals(tab, "nosozliklar", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.Status == "Failed" || x.Action.Contains("Failed") || x.Status == "Warning");
        }

        // Specific category
        if (!string.IsNullOrWhiteSpace(category) && !string.Equals(category, "all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.Category == category);
        }

        // Specific action
        if (!string.IsNullOrWhiteSpace(action) && !string.Equals(action, "all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.Action == action || x.Action.Contains(action));
        }

        // Specific status
        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "Failed", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => x.Status == "Failed" || x.Action.Contains("Failed"));
            }
            else if (string.Equals(status, "Success", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => x.Status == "Success" || x.Action.Contains("Success"));
            }
            else
            {
                query = query.Where(x => x.Status == status);
            }
        }

        // Specific user
        if (userId.HasValue)
        {
            query = query.Where(x => x.UserId == userId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(username))
        {
            var u = username.Trim().ToLower();
            query = query.Where(x => x.Username.ToLower() == u);
        }

        // IP address
        if (!string.IsNullOrWhiteSpace(ipAddress))
        {
            var ip = ipAddress.Trim();
            query = query.Where(x => x.IpAddress.Contains(ip));
        }

        // Date range
        if (startDate.HasValue)
        {
            var utcStart = DateTime.SpecifyKind(startDate.Value.Date, DateTimeKind.Utc);
            query = query.Where(x => x.CreatedAt >= utcStart);
        }
        if (endDate.HasValue)
        {
            var utcEnd = DateTime.SpecifyKind(endDate.Value.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
            query = query.Where(x => x.CreatedAt <= utcEnd);
        }

        // Text search across user, action, entity, details, IP
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(x =>
                x.Username.ToLower().Contains(s) ||
                x.UserFullName.ToLower().Contains(s) ||
                x.UserPosition.ToLower().Contains(s) ||
                x.Action.ToLower().Contains(s) ||
                x.EntityType.ToLower().Contains(s) ||
                x.EntityId.ToLower().Contains(s) ||
                x.IpAddress.Contains(s) ||
                x.Details.ToLower().Contains(s));
        }

        var totalCount = await query.CountAsync();
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        var rows = await query
            .OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new AuditLogDto(
                x.Id,
                x.UserId,
                x.Username,
                x.UserFullName,
                x.UserRole,
                x.UserPosition,
                x.UserDepartment,
                x.IpAddress,
                x.UserAgent,
                x.Action,
                x.Category,
                x.Status,
                x.EntityType,
                x.EntityId,
                x.Details,
                x.CreatedAt
            ))
            .ToListAsync();

        return Ok(new ApiResponse<AuditLogPageResponse>(true, new AuditLogPageResponse(rows, totalCount, page, pageSize, totalPages)));
    }

    [HttpGet("stats")]
    public async Task<ActionResult<ApiResponse<AuditStatsDto>>> GetStats()
    {
        var total = await db.AuditLogs.CountAsync();
        var success = await db.AuditLogs.CountAsync(x => x.Status == "Success" || x.Action == "LoginSuccess");
        var warning = await db.AuditLogs.CountAsync(x => x.Status == "Warning");
        var failed = await db.AuditLogs.CountAsync(x => x.Status == "Failed" || x.Action == "LoginFailed");
        var auth = await db.AuditLogs.CountAsync(x => x.Category == "Auth" || x.Action.Contains("Login") || x.Action.Contains("Password"));
        var order = await db.AuditLogs.CountAsync(x => x.Category == "Order" || x.Action.Contains("Order"));
        var weighing = await db.AuditLogs.CountAsync(x => x.Category == "Weighing" || x.Action.Contains("Weigh") || x.Action.Contains("Tare") || x.Action.Contains("Gross"));
        var loading = await db.AuditLogs.CountAsync(x => x.Category == "Warehouse" || x.Action.Contains("Loading") || x.Action.Contains("Product"));
        var documents = await db.AuditLogs.CountAsync(x => x.Category == "Documents" || x.Action.StartsWith("YukXati") || x.Action.Contains("Dispatched"));
        var intake = await db.AuditLogs.CountAsync(x => x.Action.Contains("Intake") || x.Action.Contains("PermitChecked") || x.Action.Contains("SecurityChecked"));

        return Ok(new ApiResponse<AuditStatsDto>(true, new AuditStatsDto(
            TotalLogs: total,
            SuccessCount: success,
            WarningCount: warning,
            FailedCount: failed,
            AuthCount: auth,
            OrderCount: order,
            WeighingCount: weighing,
            LoadingCount: loading,
            DocumentsCount: documents,
            IntakeCount: intake,
            TotalTrend: "-75%",
            SuccessTrend: "-75%",
            WarningTrend: "+0%",
            FailedTrend: "+0%"
        )));
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? tab = null,
        [FromQuery] string? search = null,
        [FromQuery] string? category = null,
        [FromQuery] string? status = null,
        [FromQuery] string? action = null,
        [FromQuery] string? username = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var query = db.AuditLogs.AsNoTracking().AsQueryable();

        if (string.Equals(tab, "logins", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Category == "Auth" || x.Action.Contains("Login") || x.Action.Contains("Password"));
        else if (string.Equals(tab, "changes", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Action.Contains("Edit") || x.Action.Contains("Update") || x.Action.Contains("Change") || x.Action.Contains("Delete"));

        if (!string.IsNullOrWhiteSpace(category) && !string.Equals(category, "all", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Category == category);

        if (!string.IsNullOrWhiteSpace(action) && !string.Equals(action, "all", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Action == action || x.Action.Contains(action));

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "Failed", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Status == "Failed" || x.Action.Contains("Failed"));
            else if (string.Equals(status, "Success", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Status == "Success" || x.Action.Contains("Success"));
            else
                query = query.Where(x => x.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(username))
            query = query.Where(x => x.Username.ToLower() == username.ToLower());

        if (startDate.HasValue)
            query = query.Where(x => x.CreatedAt >= DateTime.SpecifyKind(startDate.Value.Date, DateTimeKind.Utc));
        if (endDate.HasValue)
            query = query.Where(x => x.CreatedAt <= DateTime.SpecifyKind(endDate.Value.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(x =>
                x.Username.ToLower().Contains(s) ||
                x.UserFullName.ToLower().Contains(s) ||
                x.Action.ToLower().Contains(s) ||
                x.EntityType.ToLower().Contains(s) ||
                x.IpAddress.Contains(s));
        }

        var items = await query.OrderByDescending(x => x.CreatedAt).Take(2000).ToListAsync();

        var sb = new StringBuilder();
        // UTF-8 BOM for Excel
        sb.Append('\uFEFF');
        sb.AppendLine("Vaqt,Foydalanuvchi,Login,Lavozim,Bo'lim,Amal,Kategoriya,Status,Obyekt,IP manzil,Tafsilot");

        foreach (var item in items)
        {
            var time = item.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");
            var cleanDetails = item.Details.Replace("\"", "\"\"").Replace("\r", " ").Replace("\n", " ");
            sb.AppendLine($"\"{time}\",\"{Escape(item.UserFullName)}\",\"{Escape(item.Username)}\",\"{Escape(item.UserPosition)}\",\"{Escape(item.UserDepartment)}\",\"{Escape(item.Action)}\",\"{Escape(item.Category)}\",\"{Escape(item.Status)}\",\"{Escape(item.EntityType)} {Escape(item.EntityId)}\",\"{Escape(item.IpAddress)}\",\"{cleanDetails}\"");
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv; charset=utf-8", $"audit-logs-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv");
    }

    private static string Escape(string? val) => (val ?? string.Empty).Replace("\"", "\"\"");
}
