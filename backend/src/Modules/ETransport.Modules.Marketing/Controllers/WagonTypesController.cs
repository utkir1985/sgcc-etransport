using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Modules.Marketing.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Marketing.Controllers;

[ApiController]
[Route("api/wagon-types")]
[Route("api/catalog/wagon-types")]
[Authorize]
public class WagonTypesController(ICatalogWagonTypeService wagonTypeService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<CatalogWagonTypeDto>>>> GetAll([FromQuery] bool includeInactive = false)
    {
        var include = includeInactive && User.IsInRole(UserRoles.Admin);
        return Ok(new ApiResponse<List<CatalogWagonTypeDto>>(true, await wagonTypeService.GetAllAsync(include)));
    }

    [HttpPost]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<CatalogWagonTypeDto>>> Create([FromBody] CreateCatalogWagonTypeRequest request)
    {
        try
        {
            var item = await wagonTypeService.CreateAsync(request);
            return Ok(new ApiResponse<CatalogWagonTypeDto>(true, item));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<CatalogWagonTypeDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<CatalogWagonTypeDto>>> Update(Guid id, [FromBody] UpdateCatalogWagonTypeRequest request)
    {
        try
        {
            var item = await wagonTypeService.UpdateAsync(id, request);
            if (item is null) return NotFound(new ApiResponse<CatalogWagonTypeDto>(false, null, "Vagon turi topilmadi"));
            return Ok(new ApiResponse<CatalogWagonTypeDto>(true, item));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<CatalogWagonTypeDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var success = await wagonTypeService.DeleteAsync(id);
        if (!success) return NotFound(new ApiResponse<object>(false, null, "Vagon turi topilmadi"));
        return Ok(new ApiResponse<object>(true, null, "Vagon turi o'chirildi"));
    }
}
