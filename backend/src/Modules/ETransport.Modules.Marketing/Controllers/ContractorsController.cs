using ETransport.Infrastructure.Identity;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Modules.Marketing.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Marketing.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ContractorsController(IContractorService contractorService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<ContractorDto>>>> GetAll([FromQuery] string logisticsType) =>
        Ok(new ApiResponse<List<ContractorDto>>(true, await contractorService.GetAllAsync(logisticsType)));

    [HttpPost]
    [RequirePermission("contractors.create")]
    public async Task<ActionResult<ApiResponse<ContractorDto>>> Create([FromBody] CreateContractorRequest request)
    {
        try
        {
            var contractor = await contractorService.CreateAsync(request);
            return Ok(new ApiResponse<ContractorDto>(true, contractor));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<ContractorDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("contractors.update")]
    public async Task<ActionResult<ApiResponse<ContractorDto>>> Update(Guid id, [FromBody] UpdateContractorRequest request)
    {
        try
        {
            var contractor = await contractorService.UpdateAsync(id, request);
            return Ok(new ApiResponse<ContractorDto>(true, contractor));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<ContractorDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("contractors.delete")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        try
        {
            var deleted = await contractorService.DeleteAsync(id);
            if (!deleted)
                return NotFound(new ApiResponse<object>(false, null, "Korxona topilmadi"));
            return Ok(new ApiResponse<object>(true, null));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }
}
