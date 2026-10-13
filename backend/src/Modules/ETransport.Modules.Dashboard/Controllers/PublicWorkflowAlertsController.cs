using ETransport.Core.DTOs;
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
    public record WorkflowStageAlertDto(
        string Flow,             // "Kirish" yoki "Chiqish"
        string Role,             // "Dispatching", "Permit", "Security", "Scale", "Railway", "Warehouse"
        string Department,       // "ICHDX smena boshlig‘i", "Ruxsatnoma byurosi", ...
        string StageKey,         // "w2", "registry-approve", ...
        string StageTitle,       // "Yuk xatini tasdiqlash", ...
        int PendingCount,        // 1, 2, ...
        string VoiceText         // "Diqqat! Kirish jarayoni: Qo‘riqlash xizmati, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
    );

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<WorkflowStageAlertDto>>>> GetPendingAlerts()
    {
        var alerts = new List<WorkflowStageAlertDto>();

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
                VoiceText: "Diqqat! Kirish jarayoni: ICHDX smena boshlig‘i, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Kirish jarayoni: Ruxsatnoma byurosi, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Kirish jarayoni: Qo‘riqlash xizmati, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Kirish jarayoni: Tarozi operatori, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Chiqish jarayoni: ICHDX smena boshlig‘i, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Chiqish jarayoni: Ruxsatnoma byurosi, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Chiqish jarayoni: Qo‘riqlash xizmati, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
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
                VoiceText: "Diqqat! Chiqish jarayoni: Temir yo‘l sexi, siz E-Transport tizimiga kirib o‘z bosqichingizni tugating!"
            ));
        }

        return Ok(new ApiResponse<List<WorkflowStageAlertDto>>(true, alerts));
    }
}
