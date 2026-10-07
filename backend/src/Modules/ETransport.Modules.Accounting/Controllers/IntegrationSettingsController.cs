using ETransport.Core.DTOs;
using ETransport.Infrastructure.Integrations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Accounting.Controllers;

public record OneCCredentialsViewDto(
    string BaseUrl,
    string Username,
    bool PasswordConfigured,
    string Source,
    DateTime? UpdatedAt
);

public record SaveOneCCredentialsRequest(string BaseUrl, string Username, string? Password);

[ApiController]
[Route("api/integrations")]
[Authorize(Roles = "Admin")]
public class IntegrationSettingsController(IIntegrationCredentialsService credentials) : ControllerBase
{
    /// <summary>
    /// Integratsiya credentiallari holati — parol hech qachon qaytarilmaydi.
    /// </summary>
    [HttpGet("credentials/1c")]
    public async Task<ActionResult<ApiResponse<OneCCredentialsViewDto>>> GetOneC(CancellationToken ct)
    {
        var snap = await credentials.GetOneCAsync(ct);
        return Ok(new ApiResponse<OneCCredentialsViewDto>(true, new OneCCredentialsViewDto(
            snap.BaseUrl,
            snap.Username,
            snap.PasswordConfigured,
            snap.Source,
            snap.UpdatedAt)));
    }

    /// <summary>
    /// 1C login/URL/parolni saqlash. Password bo‘sh bo‘lsa — eski parol saqlanadi.
    /// </summary>
    [HttpPut("credentials/1c")]
    public async Task<ActionResult<ApiResponse<OneCCredentialsViewDto>>> SaveOneC(
        [FromBody] SaveOneCCredentialsRequest request,
        CancellationToken ct)
    {
        try
        {
            await credentials.SaveOneCAsync(request.BaseUrl, request.Username, request.Password, ct);
            var snap = await credentials.GetOneCAsync(ct);
            return Ok(new ApiResponse<OneCCredentialsViewDto>(true, new OneCCredentialsViewDto(
                snap.BaseUrl,
                snap.Username,
                snap.PasswordConfigured,
                snap.Source,
                snap.UpdatedAt), "Saqlandi"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<OneCCredentialsViewDto>(false, null, ex.Message));
        }
    }
}
