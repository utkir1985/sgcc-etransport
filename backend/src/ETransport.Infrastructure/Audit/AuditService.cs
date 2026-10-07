using System.Security.Claims;
using ETransport.Core.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Audit;

public record AuditContextInfo(
    Guid? UserId = null,
    string? Username = null,
    string? UserFullName = null,
    string? UserRole = null,
    string? UserPosition = null,
    string? UserDepartment = null,
    string? IpAddress = null,
    string? UserAgent = null
);

public interface IAuditService
{
    Task LogAsync(Guid? userId, string action, string entityType, string entityId, string details, string? category = null, string status = "Success");

    Task LogAsync(
        string action,
        string entityType,
        string entityId,
        string details,
        string category = "Operations",
        string status = "Success",
        AuditContextInfo? context = null);

    Task LogAuthAsync(
        string action,
        string username,
        string status,
        string details,
        Guid? userId = null,
        string? userFullName = null,
        string? role = null,
        string? position = null,
        string? department = null);
}

public class AuditService(
    Data.AppDbContext db,
    IHttpContextAccessor httpContextAccessor
) : IAuditService
{
    public async Task LogAsync(Guid? userId, string action, string entityType, string entityId, string details, string? category = null, string status = "Success")
    {
        await LogAsync(action, entityType, entityId, details, category: category ?? ResolveCategory(action, entityType), status: status, context: new AuditContextInfo(UserId: userId));
    }

    public async Task LogAsync(
        string action,
        string entityType,
        string entityId,
        string details,
        string category = "Operations",
        string status = "Success",
        AuditContextInfo? context = null)
    {
        var http = httpContextAccessor.HttpContext;
        var ip = context?.IpAddress ?? ExtractIpAddress(http);
        var ua = context?.UserAgent ?? ExtractUserAgent(http);

        var userId = context?.UserId;
        var username = context?.Username ?? string.Empty;
        var fullName = context?.UserFullName ?? string.Empty;
        var role = context?.UserRole ?? string.Empty;
        var position = context?.UserPosition ?? string.Empty;
        var department = context?.UserDepartment ?? string.Empty;

        // Agar user id ko'rsatilgan bo'lsa yoki http context dan claims bo'lsa
        if (!userId.HasValue && http?.User?.Identity?.IsAuthenticated == true)
        {
            var rawId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (Guid.TryParse(rawId, out var parsed))
            {
                userId = parsed;
            }
        }

        // Bazadagi foydalanuvchi ma'lumotlari bilan boyitish
        if (userId.HasValue && (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(fullName)))
        {
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId.Value);
            if (user != null)
            {
                username = string.IsNullOrWhiteSpace(username) ? user.Username : username;
                fullName = string.IsNullOrWhiteSpace(fullName) ? user.FullName : fullName;
                role = string.IsNullOrWhiteSpace(role) ? user.Role : role;
                position = string.IsNullOrWhiteSpace(position) ? user.Position : position;
                department = string.IsNullOrWhiteSpace(department) ? user.Department : department;
            }
        }

        db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Username = username,
            UserFullName = fullName,
            UserRole = role,
            UserPosition = position,
            UserDepartment = department,
            IpAddress = ip,
            UserAgent = ua,
            Action = action,
            Category = category,
            Status = status,
            EntityType = entityType,
            EntityId = entityId,
            Details = details,
            CreatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();
    }

    public async Task LogAuthAsync(
        string action,
        string username,
        string status,
        string details,
        Guid? userId = null,
        string? userFullName = null,
        string? role = null,
        string? position = null,
        string? department = null)
    {
        var http = httpContextAccessor.HttpContext;
        var ip = ExtractIpAddress(http);
        var ua = ExtractUserAgent(http);

        if (userId.HasValue && (string.IsNullOrWhiteSpace(userFullName) || string.IsNullOrWhiteSpace(position)))
        {
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId.Value);
            if (user != null)
            {
                userFullName = string.IsNullOrWhiteSpace(userFullName) ? user.FullName : userFullName;
                role = string.IsNullOrWhiteSpace(role) ? user.Role : role;
                position = string.IsNullOrWhiteSpace(position) ? user.Position : position;
                department = string.IsNullOrWhiteSpace(department) ? user.Department : department;
            }
        }

        db.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            Username = username,
            UserFullName = userFullName ?? string.Empty,
            UserRole = role ?? string.Empty,
            UserPosition = position ?? string.Empty,
            UserDepartment = department ?? string.Empty,
            IpAddress = ip,
            UserAgent = ua,
            Action = action,
            Category = "Auth",
            Status = status,
            EntityType = "User",
            EntityId = userId.HasValue ? userId.Value.ToString() : username,
            Details = details,
            CreatedAt = DateTime.UtcNow
        });

        await db.SaveChangesAsync();
    }

    private static string ExtractIpAddress(HttpContext? http)
    {
        if (http is null) return string.Empty;

        // 1. X-Forwarded-For (Nginx proxy orqali)
        if (http.Request.Headers.TryGetValue("X-Forwarded-For", out var fwd) && !string.IsNullOrWhiteSpace(fwd))
        {
            var first = fwd.ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(first)) return first;
        }

        // 2. X-Real-IP
        if (http.Request.Headers.TryGetValue("X-Real-IP", out var realIp) && !string.IsNullOrWhiteSpace(realIp))
        {
            return realIp.ToString().Trim();
        }

        // 3. RemoteIpAddress
        return http.Connection.RemoteIpAddress?.ToString() ?? string.Empty;
    }

    private static string ExtractUserAgent(HttpContext? http)
    {
        if (http is null) return string.Empty;
        if (http.Request.Headers.TryGetValue("User-Agent", out var ua) && !string.IsNullOrWhiteSpace(ua))
        {
            var str = ua.ToString().Trim();
            return str.Length > 500 ? str[..500] : str;
        }
        return string.Empty;
    }

    private static string ResolveCategory(string action, string entityType)
    {
        if (action.Contains("Login", StringComparison.OrdinalIgnoreCase) || action.Contains("Password", StringComparison.OrdinalIgnoreCase))
            return "Auth";
        if (action.StartsWith("YukXati", StringComparison.OrdinalIgnoreCase) || entityType.Contains("LoadingRegistry", StringComparison.OrdinalIgnoreCase) || entityType.Contains("ShippingRegistry", StringComparison.OrdinalIgnoreCase))
            return "Documents";
        if (entityType.Contains("Order", StringComparison.OrdinalIgnoreCase))
            return "Order";
        if (action.Contains("Weigh", StringComparison.OrdinalIgnoreCase) || action.Contains("Tare", StringComparison.OrdinalIgnoreCase) || action.Contains("Gross", StringComparison.OrdinalIgnoreCase) || entityType.Contains("Weigh", StringComparison.OrdinalIgnoreCase))
            return "Weighing";
        if (action.Contains("Loading", StringComparison.OrdinalIgnoreCase) || action.Contains("Product", StringComparison.OrdinalIgnoreCase) || entityType.Contains("Warehouse", StringComparison.OrdinalIgnoreCase))
            return "Warehouse";
        if (action.Contains("Security", StringComparison.OrdinalIgnoreCase) || action.Contains("Permit", StringComparison.OrdinalIgnoreCase) || action.Contains("Seal", StringComparison.OrdinalIgnoreCase) || entityType.Contains("Security", StringComparison.OrdinalIgnoreCase))
            return "Security";
        if (entityType.Contains("User", StringComparison.OrdinalIgnoreCase))
            return "UserManagement";
        return "Operations";
    }
}
