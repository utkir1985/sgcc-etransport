using ETransport.Core.DTOs;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Railway.Controllers;

[ApiController]
[Route("api/railway")]
[Authorize(Roles = "Railway,Admin")]
public class RailwayController(AppDbContext db) : ControllerBase
{
    [HttpGet("wagons")]
    public async Task<ActionResult<ApiResponse<List<WagonDto>>>> GetWagons()
    {
        var wagons = await db.Wagons.Include(w => w.WeighingRecord).Include(w => w.Shipment)
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new WagonDto(w.Id, w.WagonNumber, w.CisternNumber, w.IsInspected, w.IsLoaded, w.SealNumber,
                w.WeighingRecord == null ? null : new WeighingRecordDto(
                    w.WeighingRecord.TareWeight, w.WeighingRecord.GrossWeight,
                    w.WeighingRecord.GrossWeight - w.WeighingRecord.TareWeight, w.WeighingRecord.WeighedAt)))
            .ToListAsync();
        return Ok(new ApiResponse<List<WagonDto>>(true, wagons));
    }

    [HttpPost("wagons/{id:guid}/inspect")]
    public async Task<ActionResult<ApiResponse<WagonDto>>> Inspect(Guid id)
    {
        var wagon = await db.Wagons.Include(w => w.WeighingRecord).FirstOrDefaultAsync(w => w.Id == id);
        if (wagon is null) return NotFound(new ApiResponse<WagonDto>(false, null, "Vagon topilmadi"));
        wagon.IsInspected = true;
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<WagonDto>(true, new WagonDto(wagon.Id, wagon.WagonNumber, wagon.CisternNumber,
            wagon.IsInspected, wagon.IsLoaded, wagon.SealNumber, null)));
    }

    [HttpGet("station/status")]
    public ActionResult<ApiResponse<object>> StationStatus() =>
        Ok(new ApiResponse<object>(true, new { station = "Kengsoy", activeWagons = 0, message = "MVP — keyingi bosqichda to'ldiriladi" }));
}
