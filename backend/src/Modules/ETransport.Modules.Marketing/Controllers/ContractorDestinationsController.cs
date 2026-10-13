using ETransport.Infrastructure.Identity;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Modules.Marketing.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Marketing.Controllers;

[ApiController]
[Route("api/contractor-destinations")]
[Authorize]
public class ContractorDestinationsController(IContractorDestinationService destinationService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<ContractorDestinationDto>>>> GetByContractor(
        [FromQuery] string logisticsType,
        [FromQuery] string contractorName) =>
        Ok(new ApiResponse<List<ContractorDestinationDto>>(true,
            await destinationService.GetByContractorAsync(logisticsType, contractorName)));

    [HttpPost]
    [RequirePermission("contractors.update")]
    public async Task<ActionResult<ApiResponse<ContractorDestinationDto>>> Create(
        [FromBody] CreateContractorDestinationRequest request)
    {
        try
        {
            var destination = await destinationService.CreateAsync(request);
            return Ok(new ApiResponse<ContractorDestinationDto>(true, destination));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponse<ContractorDestinationDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("contractors.update")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        try
        {
            var deleted = await destinationService.DeleteAsync(id);
            if (!deleted)
                return NotFound(new ApiResponse<object>(false, null, "Stansiya topilmadi"));
            return Ok(new ApiResponse<object>(true, null));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }
}
