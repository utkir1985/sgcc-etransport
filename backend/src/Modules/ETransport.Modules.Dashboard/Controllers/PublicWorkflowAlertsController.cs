using Microsoft.AspNetCore.Http;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Dashboard.Controllers;

[ApiController]
[Route("api/public/workflow-alerts")]
[AllowAnonymous]
public class PublicWorkflowAlertsController(AppDbContext db) : ControllerBase
{
    private static DateTime _broadcastTestUntil = DateTime.MinValue;
    private static string _broadcastMessage = "";

    public record WorkflowStageAlertDto(
        string Flow,             // "Kirish" yoki "Chiqish"
        string Role,             // "Dispatching", "Permit", "Security", "Scale", "Railway", "Warehouse"
        string Department,       // "ICHDX smena boshlig‘i", "Ruxsatnoma byurosi", ...
        string StageKey,         // "w2", "registry-approve", ...
        string StageTitle,       // "Yuk xatini tasdiqlash", ...
        int PendingCount,        // 1, 2, ...
        string VoiceText         // "Внимание! Входной контроль: Служба охраны, подтвердите досмотр и въезд вагонов в системе E-Transport!"
    );

        public record VoiceDeliveryLogRequest(
        string? Flow,
        string? Role,
        string? Department,
        string? StageKey,
        string? StageTitle,
        int? PendingCount,
        string? VoiceText,
        string? Username,
        string? FullName,
        string? ClientRole,
        string? Status,
        string? Details
    );

    public record VoiceDeliveryLogDto(
        Guid Id,
        string Username,
        string UserFullName,
        string UserRole,
        string UserDepartment,
        string IpAddress,
        string Action,
        string Status,
        string EntityType,
        string EntityId,
        string Details,
        DateTime CreatedAt
    );

    public record BroadcastRequest(string? Message, int? DurationSeconds);

    [HttpPost("broadcast-test")]
    public ActionResult<ApiResponse<bool>> BroadcastTest([FromBody] BroadcastRequest? request)
    {
        var duration = request?.DurationSeconds ?? 120;
        _broadcastTestUntil = DateTime.UtcNow.AddSeconds(duration);
        _broadcastMessage = !string.IsNullOrWhiteSpace(request?.Message)
            ? request.Message
            : "Внимание! Проверка системы: Голосовое оповещение в системе E-Transport работает успешно!";

        return Ok(new ApiResponse<bool>(true, true, $"Sinov ovozli xabari {duration} soniya davomida barcha foydalanuvchilarga yuborildi"));
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<WorkflowStageAlertDto>>>> GetPendingAlerts()
    {
        var alerts = new List<WorkflowStageAlertDto>();

        // 0. Barcha kompyuterlarga umumiy sinov xabari (agar aktiv bo'lsa)
        if (DateTime.UtcNow < _broadcastTestUntil)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Umumiy",
                Role: "ALL",
                Department: "Barcha xizmatlar",
                StageKey: "test-broadcast",
                StageTitle: "Tizim sinov ogohlantirishi",
                PendingCount: 1,
                VoiceText: _broadcastMessage
            ));
        }

        // 1. Kirish jarayoni (Bo'sh vagonlar)
        var activeArrivals = await db.EmptyWagonArrivals
            .AsNoTracking()
            .Include(a => a.Units)
            .Where(a => a.Stage != "Cancelled" && a.Stage != "Exited")
            .ToListAsync();

        // 1.1. ICHDX smena boshlig'i (Xizmat xatini tasdiqlash)
        var w2Pending = activeArrivals
            .Where(a => (a.Stage == "ServiceLetterIssued" || a.Stage == "Initial" || a.Stage == "KengsoyInspection") 
                        && a.EntryPermitShiftApprovedAt == null)
            .ToList();
        if (w2Pending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Kirish",
                Role: "Dispatching",
                Department: "ICHDX smena boshlig‘i",
                StageKey: "w2",
                StageTitle: "Tasdiqlash va ijroga yo‘naltirish",
                PendingCount: w2Pending.Count,
                VoiceText: "Внимание! Входной контроль: Начальник смены, подтвердите служебную записку в системе E-Transport!"
            ));
        }

        // 1.2. Ruxsatnoma byurosi (Kiritishni kelishish)
        var permitPending = activeArrivals
            .Where(a => a.EntryPermitShiftApprovedAt != null && a.EntryPermitPermitApprovedAt == null)
            .ToList();
        if (permitPending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Kirish",
                Role: "Permit",
                Department: "Ruxsatnoma byurosi",
                StageKey: "entry-permit",
                StageTitle: "Vagonlarni kiritishni kelishish",
                PendingCount: permitPending.Count,
                VoiceText: "Внимание! Входной контроль: Бюро пропусков, оформите разрешение на въезд в системе E-Transport!"
            ));
        }

        // 1.3. Qo'riqlash xizmati (Tekshirish va kiritish)
        var securityPending = activeArrivals
            .Where(a => a.EntryPermitPermitApprovedAt != null && a.EntryPermitSecurityApprovedAt == null)
            .ToList();
        if (securityPending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Kirish",
                Role: "Security",
                Department: "Qo‘riqlash xizmati",
                StageKey: "entry-security",
                StageTitle: "Vagonlarni tekshirish va kiritish",
                PendingCount: securityPending.Count,
                VoiceText: "Внимание! Входной контроль: Служба охраны, подтвердите досмотр и въезд вагонов в системе E-Transport!"
            ));
        }

        // 1.4. Tarozi operatori (Bo'sh vagon tarasini tortish)
        var scalePending = activeArrivals
            .Where(a => a.EntryPermitSecurityApprovedAt != null && 
                        (a.Units == null || a.Units.Any(u => u.Status != "Returned" && u.TareWeighedAt == null)))
            .ToList();
        if (scalePending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Kirish",
                Role: "Scale",
                Department: "Tarozi operatori",
                StageKey: "w5",
                StageTitle: "Bo‘sh vagon tarasini tortish",
                PendingCount: scalePending.Count,
                VoiceText: "Внимание! Входной контроль: Весовщик, взвесьте тару порожних вагонов в системе E-Transport!"
            ));
        }

        // 2. Chiqish jarayoni (Yuk xatlari / Reyestrlar)
        var activeRegistries = await db.LoadingRegistries
            .AsNoTracking()
            .Where(r => r.ExitedToKengsoyAt == null)
            .ToListAsync();

        // 2.1. ICHDX smena boshlig'i (Yuk xatini tasdiqlash)
        var regShiftPending = activeRegistries
            .Where(r => !r.IsApprovedByShiftSupervisor)
            .ToList();
        if (regShiftPending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Chiqish",
                Role: "Dispatching",
                Department: "ICHDX smena boshlig‘i",
                StageKey: "registry-approve",
                StageTitle: "Yuk xatini tasdiqlash",
                PendingCount: regShiftPending.Count,
                VoiceText: "Внимание! Выходной контроль: Начальник смены, утвердите накладную в системе E-Transport!"
            ));
        }

        // 2.2. Ruxsatnoma byurosi (Yuk xatini kelishish)
        var regPermitPending = activeRegistries
            .Where(r => r.IsApprovedByShiftSupervisor && !r.IsApprovedByPermit)
            .ToList();
        if (regPermitPending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Chiqish",
                Role: "Permit",
                Department: "Ruxsatnoma byurosi",
                StageKey: "w10",
                StageTitle: "Yuk xatini kelishish",
                PendingCount: regPermitPending.Count,
                VoiceText: "Внимание! Выходной контроль: Бюро пропусков, согласуйте выезд вагонов в системе E-Transport!"
            ));
        }

        // 2.3. Qo'riqlash xizmati (Vagonlarni tekshirib chiqarish)
        var regSecurityPending = activeRegistries
            .Where(r => r.IsApprovedByShiftSupervisor && r.IsApprovedByPermit && !r.IsApprovedBySecurity)
            .ToList();
        if (regSecurityPending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Chiqish",
                Role: "Security",
                Department: "Qo‘riqlash xizmati",
                StageKey: "exit-security",
                StageTitle: "Vagonlarni tekshirib chiqarish",
                PendingCount: regSecurityPending.Count,
                VoiceText: "Внимание! Выходной контроль: Служба охраны, подтвердите досмотр и выезд вагонов в системе E-Transport!"
            ));
        }

        // 2.4. Temir yo'l sexi (Vagonlarni chiqarish)
        var regRailwayPending = activeRegistries
            .Where(r => r.IsApprovedByShiftSupervisor && r.IsApprovedByPermit && r.IsApprovedBySecurity && r.ExitedToKengsoyAt == null)
            .ToList();
        if (regRailwayPending.Count > 0)
        {
            alerts.Add(new WorkflowStageAlertDto(
                Flow: "Chiqish",
                Role: "Railway",
                Department: "Temir yo‘l sexi",
                StageKey: "exit-railway",
                StageTitle: "Vagonlarni chiqarish",
                PendingCount: regRailwayPending.Count,
                VoiceText: "Внимание! Выходной контроль: Железнодорожный цех, оформите вывод вагонов на станцию Кенгсой!"
            ));
        }

        return Ok(new ApiResponse<List<WorkflowStageAlertDto>>(true, alerts));
    }

    [HttpPost("log-delivery")]
    public async Task<ActionResult<ApiResponse<bool>>> LogDelivery([FromBody] VoiceDeliveryLogRequest req)
    {
        var ip = ExtractIpAddress(HttpContext);
        var ua = ExtractUserAgent(HttpContext);

        var username = !string.IsNullOrWhiteSpace(req.Username) ? req.Username.Trim() : "Noma'lum";
        var fullName = !string.IsNullOrWhiteSpace(req.FullName) ? req.FullName.Trim() : "Anonim (Logout holatida)";
        var role = !string.IsNullOrWhiteSpace(req.ClientRole) ? req.ClientRole.Trim() : (req.Role ?? "Noma'lum");
        var dept = !string.IsNullOrWhiteSpace(req.Department) ? req.Department.Trim() : "Navbatchilik";

        Guid? userId = null;
        if (HttpContext.User?.Identity?.IsAuthenticated == true)
        {
            var rawId = HttpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(rawId, out var parsed))
            {
                userId = parsed;
            }
        }

        var details = !string.IsNullOrWhiteSpace(req.Details)
            ? req.Details
            : $"{req.Flow ?? "Tizim"} jarayoni bo‘yicha ovozli ogohlantirish eshittirildi: {dept} ({req.StageTitle ?? req.StageKey}, {req.PendingCount ?? 1} ta). Matn: \"{req.VoiceText}\"";

        var log = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Username = username.Length > 100 ? username[..100] : username,
            UserFullName = fullName.Length > 200 ? fullName[..200] : fullName,
            UserRole = role.Length > 50 ? role[..50] : role,
            UserPosition = "Mas'ul xodim",
            UserDepartment = dept.Length > 200 ? dept[..200] : dept,
            IpAddress = ip.Length > 50 ? ip[..50] : ip,
            UserAgent = ua.Length > 500 ? ua[..500] : ua,
            Action = "VoiceAlertAnnounced",
            Category = "VoiceAlert",
            Status = !string.IsNullOrWhiteSpace(req.Status) ? req.Status : "Success",
            EntityType = "WorkflowAlert",
            EntityId = req.StageKey ?? "Alert",
            Details = details,
            CreatedAt = DateTime.UtcNow
        };

        db.AuditLogs.Add(log);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<bool>(true, true, "Ovozli ogohlantirish auditi muvaffaqiyatli qayd etildi"));
    }

    [HttpGet("delivery-logs")]
    public async Task<ActionResult<ApiResponse<List<VoiceDeliveryLogDto>>>> GetDeliveryLogs([FromQuery] int limit = 50)
    {
        var maxLimit = Math.Min(limit, 200);
        var logs = await db.AuditLogs
            .AsNoTracking()
            .Where(x => x.Category == "VoiceAlert" || x.Action == "VoiceAlertAnnounced")
            .OrderByDescending(x => x.CreatedAt)
            .Take(maxLimit)
            .Select(x => new VoiceDeliveryLogDto(
                x.Id,
                x.Username,
                x.UserFullName,
                x.UserRole,
                x.UserDepartment,
                x.IpAddress,
                x.Action,
                x.Status,
                x.EntityType,
                x.EntityId,
                x.Details,
                x.CreatedAt
            ))
            .ToListAsync();

        return Ok(new ApiResponse<List<VoiceDeliveryLogDto>>(true, logs));
    }

    private static string ExtractIpAddress(HttpContext? http)
    {
        if (http is null) return string.Empty;
        if (http.Request.Headers.TryGetValue("X-Forwarded-For", out var fwd) && !string.IsNullOrWhiteSpace(fwd))
        {
            var first = fwd.ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(first)) return first;
        }
        if (http.Request.Headers.TryGetValue("X-Real-IP", out var realIp) && !string.IsNullOrWhiteSpace(realIp))
        {
            return realIp.ToString().Trim();
        }
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
}
