using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Infrastructure.Identity.Controllers;

[ApiController]
[Route("api/rbac")]
[Authorize]
public class RbacController(IRbacService rbacService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<object>>> Get()
    {
        var json = await rbacService.GetConfigJsonAsync();
        if (string.IsNullOrWhiteSpace(json))
            return Ok(new ApiResponse<object>(true, null));

        try
        {
            var data = JsonSerializer.Deserialize<object>(json);
            return Ok(new ApiResponse<object>(true, data));
        }
        catch (JsonException)
        {
            return Ok(new ApiResponse<object>(true, null, "RBAC konfiguratsiyasi buzilgan"));
        }
    }

    /// <summary>
    /// Rol bo‘yicha boshqariladigan sahifalar. Hozircha — Statistika sahifasi.
    /// </summary>
    [HttpGet("page-access")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<PageAccessDto>>> GetPageAccess()
    {
        var reportsRoles = await rbacService.GetActionRolesAsync(RbacService.ReportsViewAction);
        var plansRoles = await rbacService.GetActionRolesAsync(RbacService.PlansViewAction);
        return Ok(new ApiResponse<PageAccessDto>(true, new PageAccessDto(reportsRoles, plansRoles, UserRoles.All)));
    }

    [HttpPut("page-access")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<PageAccessDto>>> SavePageAccess([FromBody] SavePageAccessRequest request)
    {
        if (request.ReportsRoles != null)
        {
            var requestedReports = request.ReportsRoles.Append(UserRoles.Admin).Distinct(StringComparer.Ordinal).ToList();
            await rbacService.SetActionRolesAsync(RbacService.ReportsViewAction, requestedReports);
        }

        if (request.PlansRoles != null)
        {
            var requestedPlans = request.PlansRoles.Append(UserRoles.Admin).Distinct(StringComparer.Ordinal).ToList();
            await rbacService.SetActionRolesAsync(RbacService.PlansViewAction, requestedPlans);
        }

        var savedReports = await rbacService.GetActionRolesAsync(RbacService.ReportsViewAction);
        var savedPlans = await rbacService.GetActionRolesAsync(RbacService.PlansViewAction);
        return Ok(new ApiResponse<PageAccessDto>(true, new PageAccessDto(savedReports, savedPlans, UserRoles.All), "Saqlandi"));
    }

    [HttpPut]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<object>>> Save([FromBody] JsonElement body)
    {
        if (body.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return BadRequest(new ApiResponse<object>(false, null, "Bo'sh sozlama"));

        var json = body.GetRawText();
        await rbacService.SaveConfigJsonAsync(json);
        return Ok(new ApiResponse<object>(true, null, "RBAC sozlamalari saqlandi"));
    }
}

/// <summary>Statistika sahifasini ko‘ra oladigan rollar va tizimdagi barcha rollar.</summary>
public record PageAccessDto(IReadOnlyList<string> ReportsRoles, IReadOnlyList<string> PlansRoles, IReadOnlyList<string> AllRoles);

public record SavePageAccessRequest(List<string>? ReportsRoles, List<string>? PlansRoles);
