using System.Security.Claims;
using ETransport.Core.DTOs;
using ETransport.Modules.Dashboard.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Dashboard.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController(IDashboardService dashboardService, IServerStatusService serverStatusService) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<ActionResult<ApiResponse<DashboardStatsDto>>> Stats()
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        return Ok(new ApiResponse<DashboardStatsDto>(true, await dashboardService.GetStatsAsync(role)));
    }

    [HttpGet("server-status")]
    public async Task<ActionResult<ApiResponse<ServerStatusDto>>> ServerStatus()
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (!string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var status = await serverStatusService.GetAsync();
        return Ok(new ApiResponse<ServerStatusDto>(true, status));
    }
}
