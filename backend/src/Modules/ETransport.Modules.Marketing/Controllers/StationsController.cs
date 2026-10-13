using ETransport.Infrastructure.Identity;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Modules.Marketing.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Marketing.Controllers;

[ApiController]
[Route("api/stations")]
[Route("api/catalog/stations")]
[Authorize]
public class StationsController(ICatalogStationService stationService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<CatalogStationDto>>>> GetAll(
        [FromQuery] string? logisticsType = null,
        [FromQuery] bool includeInactive = false)
    {
        var include = includeInactive && User.IsInRole(UserRoles.Admin);
        return Ok(new ApiResponse<List<CatalogStationDto>>(true, await stationService.GetAllAsync(logisticsType, include)));
    }

    [HttpPost]
    [RequirePermission("stations.create")]
    public async Task<ActionResult<ApiResponse<CatalogStationDto>>> Create([FromBody] CreateCatalogStationRequest request)
    {
        try
        {
            var item = await stationService.CreateAsync(request);
            return Ok(new ApiResponse<CatalogStationDto>(true, item));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<CatalogStationDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("stations.update")]
    public async Task<ActionResult<ApiResponse<CatalogStationDto>>> Update(Guid id, [FromBody] UpdateCatalogStationRequest request)
    {
        try
        {
            var item = await stationService.UpdateAsync(id, request);
            if (item is null) return NotFound(new ApiResponse<CatalogStationDto>(false, null, "Stansiya topilmadi"));
            return Ok(new ApiResponse<CatalogStationDto>(true, item));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<CatalogStationDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("stations.delete")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var success = await stationService.DeleteAsync(id);
        if (!success) return NotFound(new ApiResponse<object>(false, null, "Stansiya topilmadi"));
        return Ok(new ApiResponse<object>(true, null, "Stansiya o'chirildi"));
    }
}
