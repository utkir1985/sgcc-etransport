using System.Security.Claims;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Modules.Dispatching.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Dispatching.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PlansController(IPlanService planService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<DailyPlanDto>>>> GetAll() =>
        Ok(new ApiResponse<List<DailyPlanDto>>(true, await planService.GetAllAsync()));

    [HttpGet("allocatable-orders")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<OrderPlanBalanceDto>>>> GetAllocatableOrders([FromQuery] string? logisticsType = null) =>
        Ok(new ApiResponse<List<OrderPlanBalanceDto>>(true, await planService.GetAllocatableOrdersAsync(logisticsType)));

    [HttpGet("wagon-availability")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<PlanWagonAvailabilityDto>>>> GetWagonAvailability(
        [FromQuery] string? productType = null,
        [FromQuery] Guid? excludePlanId = null) =>
        Ok(new ApiResponse<List<PlanWagonAvailabilityDto>>(
            true,
            await planService.GetWagonAvailabilityAsync(productType, excludePlanId)));

    [HttpPost]
    [Authorize(Roles = $"{UserRoles.Dispatching},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<DailyPlanDto>>> Create([FromBody] CreateDailyPlanRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            return Ok(new ApiResponse<DailyPlanDto>(true, await planService.CreateAsync(request, userId)));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<DailyPlanDto>(false, null, ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = $"{UserRoles.Dispatching},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<DailyPlanDto>>> Update(Guid id, [FromBody] CreateDailyPlanRequest request)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var updated = await planService.UpdateAsync(id, request, userId);
            if (updated is null) return NotFound(new ApiResponse<DailyPlanDto>(false, null, "Reja topilmadi"));
            return Ok(new ApiResponse<DailyPlanDto>(true, updated));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<DailyPlanDto>(false, null, ex.Message));
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = $"{UserRoles.Dispatching},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<bool>>> Delete(Guid id)
    {
        try
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var deleted = await planService.DeleteAsync(id, userId);
            if (!deleted) return NotFound(new ApiResponse<bool>(false, false, "Reja topilmadi"));
            return Ok(new ApiResponse<bool>(true, true));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<bool>(false, false, ex.Message));
        }
    }

    [HttpPost("{id:guid}/approve-msmx")]
    [Authorize(Roles = $"{UserRoles.Dispatching},{UserRoles.Management},{UserRoles.Marketing},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<DailyPlanDto>>> ApproveMsMx(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var plan = await planService.ApproveMsMxAsync(id, userId);
        if (plan is null) return NotFound(new ApiResponse<DailyPlanDto>(false, null, "Reja topilmadi"));
        return Ok(new ApiResponse<DailyPlanDto>(true, plan));
    }

    [HttpPost("{id:guid}/approve-railway")]
    [Authorize(Roles = $"{UserRoles.Railway},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<DailyPlanDto>>> ApproveRailway(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var plan = await planService.ApproveRailwayAsync(id, userId);
        if (plan is null) return NotFound(new ApiResponse<DailyPlanDto>(false, null, "Reja topilmadi"));
        return Ok(new ApiResponse<DailyPlanDto>(true, plan));
    }

    [HttpPost("{id:guid}/approve-warehouse")]
    [Authorize(Roles = $"{UserRoles.Warehouse},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<DailyPlanDto>>> ApproveWarehouse(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var plan = await planService.ApproveWarehouseAsync(id, userId);
        if (plan is null) return NotFound(new ApiResponse<DailyPlanDto>(false, null, "Reja topilmadi"));
        return Ok(new ApiResponse<DailyPlanDto>(true, plan));
    }

    [HttpPost("{id:guid}/approve-security")]
    [Authorize(Roles = $"{UserRoles.Security},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<DailyPlanDto>>> ApproveSecurity(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var plan = await planService.ApproveSecurityAsync(id, userId);
        if (plan is null) return NotFound(new ApiResponse<DailyPlanDto>(false, null, "Reja topilmadi"));
        return Ok(new ApiResponse<DailyPlanDto>(true, plan));
    }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ShipmentsController(IShipmentService shipmentService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<ShipmentDto>>>> GetAll() =>
        Ok(new ApiResponse<List<ShipmentDto>>(true, await shipmentService.GetAllAsync()));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ShipmentDetailDto>>> GetById(Guid id)
    {
        var shipment = await shipmentService.GetByIdAsync(id);
        if (shipment is null) return NotFound(new ApiResponse<ShipmentDetailDto>(false, null, "Jo'natma topilmadi"));
        return Ok(new ApiResponse<ShipmentDetailDto>(true, shipment));
    }

    [HttpPost("from-plan/{planId:guid}")]
    [Authorize(Roles = $"{UserRoles.Dispatching},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<ShipmentDto>>> CreateFromPlan(Guid planId) =>
        Ok(new ApiResponse<ShipmentDto>(true, await shipmentService.CreateFromPlanAsync(planId)));

    [HttpPost("{id:guid}/status/{status}")]
    [Authorize(Roles = "Dispatching,Railway,Admin")]
    public async Task<ActionResult<ApiResponse<ShipmentDetailDto>>> UpdateStatus(
        Guid id, string status, [FromBody] StatusUpdateRequest request)
    {
        if (!Enum.TryParse<ShipmentStatus>(status, true, out var newStatus))
            return BadRequest(new ApiResponse<ShipmentDetailDto>(false, null, "Noto'g'ri status"));
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var result = await shipmentService.AdvanceStatusAsync(id, newStatus, userId, request.Comment);
        if (result is null) return NotFound(new ApiResponse<ShipmentDetailDto>(false, null, "Jo'natma topilmadi"));
        return Ok(new ApiResponse<ShipmentDetailDto>(true, result));
    }

    [HttpPost("{id:guid}/wagons")]
    [Authorize(Roles = $"{UserRoles.Railway},{UserRoles.Scale},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<WagonDto>>> AddWagon(Guid id, [FromBody] CreateWagonRequest request)
    {
        var wagon = await shipmentService.AddWagonAsync(id, request);
        if (wagon is null) return NotFound(new ApiResponse<WagonDto>(false, null, "Jo'natma topilmadi"));
        return Ok(new ApiResponse<WagonDto>(true, wagon));
    }

    [HttpPost("wagons/{wagonId:guid}/weigh")]
    [Authorize(Roles = $"{UserRoles.Scale},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<WagonDto>>> Weigh(Guid wagonId, [FromBody] WeighingRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var wagon = await shipmentService.WeighWagonAsync(wagonId, request, userId);
        if (wagon is null) return NotFound(new ApiResponse<WagonDto>(false, null, "Vagon topilmadi"));
        return Ok(new ApiResponse<WagonDto>(true, wagon));
    }

    [HttpPost("wagons/{wagonId:guid}/seal")]
    [Authorize(Roles = $"{UserRoles.Scale},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<WagonDto>>> Seal(Guid wagonId, [FromBody] SealRequest request)
    {
        var wagon = await shipmentService.SealWagonAsync(wagonId, request);
        if (wagon is null) return NotFound(new ApiResponse<WagonDto>(false, null, "Vagon topilmadi"));
        return Ok(new ApiResponse<WagonDto>(true, wagon));
    }

    [HttpPost("{id:guid}/security-check")]
    [Authorize(Roles = $"{UserRoles.Security},{UserRoles.Permit},{UserRoles.Admin}")]
    public async Task<ActionResult<ApiResponse<ShipmentDetailDto>>> SecurityCheck(
        Guid id, [FromBody] SecurityCheckRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var result = await shipmentService.SecurityCheckAsync(id, request, userId);
        if (result is null) return NotFound(new ApiResponse<ShipmentDetailDto>(false, null, "Jo'natma topilmadi"));
        return Ok(new ApiResponse<ShipmentDetailDto>(true, result));
    }
}

[ApiController]
[Route("api/dispatch/journal")]
[Authorize(Roles = $"{UserRoles.Dispatching},{UserRoles.DispatchSupervisor},{UserRoles.Management},{UserRoles.DeputyDirector},{UserRoles.Admin}")]
public class DispatchJournalController(IDispatchJournalService journalService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<DispatchJournalDto>>>> GetAll() =>
        Ok(new ApiResponse<List<DispatchJournalDto>>(true, await journalService.GetAllAsync()));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<DispatchJournalDto>>> Create([FromBody] DispatchJournalCreateRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var entry = await journalService.CreateAsync(request.ShipmentId, request.Entry, userId);
        return Ok(new ApiResponse<DispatchJournalDto>(true, entry));
    }
}

public record DispatchJournalCreateRequest(Guid ShipmentId, string Entry);
