using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.GateScales.Controllers;

[ApiController]
[Route("api/gate")]
[Authorize]
public class GateScalesController(AppDbContext db) : ControllerBase
{
    [HttpGet("weighing")]
    [Authorize(Roles = "Scale,Railway,Security,Economist,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> WeighingQueue()
    {
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .OrderByDescending(a => a.CreatedAt)
            .Take(120)
            .ToListAsync();

        foreach (var arrival in arrivals.Where(a => a.Units.Count == 0))
            await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
        await db.SaveChangesAsync();

        var exitedRegistries = await db.LoadingRegistries.AsNoTracking()
            .Where(r => r.ExitedToKengsoyAt != null)
            .Select(r => new { r.EmptyWagonArrivalId, r.WagonRoutesJson, r.ExitedToKengsoyAt })
            .ToListAsync();

        var exitedArrivalIds = exitedRegistries.Select(r => r.EmptyWagonArrivalId).ToHashSet();
        var exitedWagonsByArrival = exitedRegistries
            .GroupBy(r => r.EmptyWagonArrivalId)
            .ToDictionary(
                g => g.Key,
                g => g.SelectMany(r => {
                    try {
                        return System.Text.Json.JsonSerializer.Deserialize<List<LoadingRegistryWagonRouteDto>>(r.WagonRoutesJson) ?? [];
                    } catch { return new List<LoadingRegistryWagonRouteDto>(); }
                })
                .Select(r => r.WagonNumber)
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
            );

        var emptyArrivals = arrivals.Select(a => {
            var isArrivalExited = a.Stage == "Exited" || exitedArrivalIds.Contains(a.Id);
            var exitedWagonsInThisArrival = exitedWagonsByArrival.TryGetValue(a.Id, out var set) ? set : null;
            return new
            {
                a.Id,
                a.ArrivalNumber,
                a.WagonCount,
                a.WagonNumbers,
                a.CisternNumbers,
                a.ProductType,
                a.TrackNumber,
                Stage = isArrivalExited ? "Exited" : a.Stage,
                a.TareWeight,
                a.GrossWeight,
                a.VerifiedWagonNumbers,
                a.Notes,
                a.CreatedAt,
                Wagons = a.Units
                    .OrderBy(u => u.SortOrder)
                    .Select(u => {
                        var isUnitExited = u.ScaleExitedAt != null || (exitedWagonsInThisArrival != null && exitedWagonsInThisArrival.Contains(u.WagonNumber));
                        return new
                        {
                            u.Id,
                            u.WagonNumber,
                            u.CisternNumber,
                            u.WagonType,
                            u.Ownership,
                            u.IntakeLoadState,
                            u.ProductType,
                            u.Status,
                            u.TareWeight,
                            u.GrossWeight,
                            NettoWeight = EmptyWagonUnitSync.FormatNetto(u.TareWeight, u.GrossWeight),
                            u.LoadingComment,
                            u.LoadingBatchNumber,
                            u.LoadingStartedAt,
                            u.LoadingCompletedAt,
                            u.TareWeighedAt,
                            u.TareCheckedAt,
                            u.GrossWeighedAt,
                            ScaleExitedAt = u.ScaleExitedAt ?? (isUnitExited ? a.CreatedAt : null),
                            u.SortOrder,
                            u.SealNumber,
                            u.SealedAt,
                            u.SealEnteredToUngAt,
                            u.SealConfirmedByScaleAt,
                            u.SealConfirmedByScaleName,
                            u.SealConfirmedBySecurityAt,
                            u.SealConfirmedBySecurityName,
                            u.SealConfirmedByEconomistAt,
                            u.SealConfirmedByEconomistName,
                            u.DefectActNumber,
                            u.DefectActFileName,
                            u.DefectActUploadedAt,
                            u.DefectActType,
                        };
                    })
                    .ToList(),
            };
        }).ToList();

        var shipments = await db.Shipments
            .Include(s => s.Wagons)
            .ThenInclude(w => w.WeighingRecord)
            .OrderByDescending(s => s.CreatedAt)
            .Take(20)
            .Select(s => new
            {
                s.Id,
                s.ShipmentNumber,
                s.DestinationStation,
                WagonCount = s.Wagons.Count,
                s.CreatedAt
            })
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, new
        {
            emptyWagonsQueue = emptyArrivals,
            shipmentsQueue = shipments,
            scaleConnected = true,
            scaleDevice = "UNG Railway Scale #1 (ONLINE - 0.00 tn)"
        }));
    }

    [HttpGet("gate/status")]
    [Authorize(Roles = "Security,Admin")]
    public ActionResult<ApiResponse<object>> GateStatus() =>
        Ok(new ApiResponse<object>(true, new { gate = "Chiqish nazorati", status = "Ochiq", message = "ANPR/RFID — faol" }));
}
