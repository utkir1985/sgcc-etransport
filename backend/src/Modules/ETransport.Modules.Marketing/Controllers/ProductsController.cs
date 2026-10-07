using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Modules.Marketing.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Marketing.Controllers;

[ApiController]
[Route("api/products")]
[Authorize]
public class ProductsController(ICatalogProductService productService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<CatalogProductDto>>>> GetAll(
        [FromQuery] string? logisticsType = null,
        [FromQuery] bool includeInactive = false)
    {
        // Faqat Admin nofaol mahsulotlarni ham ko'radi
        var include = includeInactive && User.IsInRole(UserRoles.Admin);
        return Ok(new ApiResponse<List<CatalogProductDto>>(
            true, await productService.GetAllAsync(logisticsType, include)));
    }

    [HttpPost]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<CatalogProductDto>>> Create([FromBody] CreateCatalogProductRequest request)
    {
        try
        {
            var product = await productService.CreateAsync(request);
            return Ok(new ApiResponse<CatalogProductDto>(true, product));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<CatalogProductDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<CatalogProductDto>>> Update(
        Guid id, [FromBody] UpdateCatalogProductRequest request)
    {
        try
        {
            var product = await productService.UpdateAsync(id, request);
            if (product is null)
                return NotFound(new ApiResponse<CatalogProductDto>(false, null, "Mahsulot topilmadi"));
            return Ok(new ApiResponse<CatalogProductDto>(true, product));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<CatalogProductDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var deleted = await productService.DeleteAsync(id);
        if (!deleted)
            return NotFound(new ApiResponse<object>(false, null, "Mahsulot topilmadi"));
        return Ok(new ApiResponse<object>(true, null));
    }
}
