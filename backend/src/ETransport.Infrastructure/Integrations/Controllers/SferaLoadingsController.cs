using System.Security.Cryptography;
using System.Text;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ETransport.Infrastructure.Integrations.Controllers;

/// <summary>Sfera Balance uchun bitta vagonning yuklash/tortish vaqtlari.</summary>
public record SferaLoadingItemDto(
    string WagonNumber,
    string CisternNumber,
    string ProductType,
    string Status,
    DateTime? EstakadaPlacedAt,
    DateTime? EstakadaRemovedAt,
    DateTime? LoadingStartedAt,
    DateTime? LoadingCompletedAt,
    DateTime? GrossWeighedAt,
    DateTime? ScaleExitedAt,
    string TareWeight,
    string GrossWeight,
    string LoadingBatchNumber,
    Guid ArrivalId);

public record SferaLoadingsResultDto(
    string Date1,
    string Date2,
    string Timezone,
    int Count,
    IReadOnlyList<SferaLoadingItemDto> Items);

/// <summary>
/// Sfera Balance sutkalik balansida yuklangan mahsulotni tarozi sanasiga emas,
/// haqiqiy yuklash sanasiga bog'lashi uchun kerak bo'ladigan vaqt belgilari.
/// Mashina-mashina chaqiruvi: foydalanuvchi sessiyasi emas, <c>X-Sfera-Key</c> kaliti.
/// </summary>
[ApiController]
[Route("api/integrations/sfera")]
public class SferaLoadingsController(AppDbContext db, IConfiguration configuration) : ControllerBase
{
    private const string KeyHeader = "X-Sfera-Key";

    /// <summary>Tashkent (UTC+5) — 1C ham, Sfera ham shu mintaqada ishlaydi.</summary>
    private static readonly TimeSpan TashkentOffset = TimeSpan.FromHours(5);

    /// <summary>
    /// Vagon yuklanib, keyinroq tortilishi mumkin: so'ralgan oraliqqa tushgan yuklashni
    /// topish uchun tortish vaqti bo'yicha ikki tomonga shuncha sutka qo'shib qidiriladi.
    /// </summary>
    private const int WindowPaddingDays = 20;

    [HttpGet("loadings")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<SferaLoadingsResultDto>>> GetLoadings(
        [FromQuery] string? date1,
        [FromQuery] string? date2,
        [FromQuery] string? product,
        CancellationToken cancellationToken = default)
    {
        var configured = configuration["Sfera:IntegrationKey"];
        if (string.IsNullOrWhiteSpace(configured))
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new ApiResponse<SferaLoadingsResultDto>(false, null, "Sfera integratsiya kaliti sozlanmagan"));

        var presented = Request.Headers[KeyHeader].ToString();
        if (string.IsNullOrEmpty(presented) || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(presented), Encoding.UTF8.GetBytes(configured.Trim())))
            return Unauthorized(new ApiResponse<SferaLoadingsResultDto>(false, null, "Kalit noto'g'ri"));

        if (!TryParseDay(date1, out var from) || !TryParseDay(date2, out var to))
            return BadRequest(new ApiResponse<SferaLoadingsResultDto>(false, null, "date1/date2 yyyy-MM-dd formatida bo'lishi kerak"));
        if (to < from)
            return BadRequest(new ApiResponse<SferaLoadingsResultDto>(false, null, "date2 date1 dan oldin bo'lishi mumkin emas"));
        if ((to - from).TotalDays > 400)
            return BadRequest(new ApiResponse<SferaLoadingsResultDto>(false, null, "Oraliq 400 sutkadan oshmasin"));

        // Mahalliy sutka chegaralari UTC ga o'tkaziladi (DB da hamma vaqt UTC).
        var fromUtc = new DateTimeOffset(from.AddDays(-WindowPaddingDays), TashkentOffset).UtcDateTime;
        var toUtc = new DateTimeOffset(to.AddDays(WindowPaddingDays + 1), TashkentOffset).UtcDateTime;

        var query = db.EmptyWagonUnits.AsNoTracking()
            .Where(u => u.Status != EmptyWagonUnitStatuses.Returned)
            .Where(u =>
                (u.LoadingCompletedAt >= fromUtc && u.LoadingCompletedAt < toUtc)
                || (u.LoadingStartedAt >= fromUtc && u.LoadingStartedAt < toUtc)
                || (u.EstakadaPlacedAt >= fromUtc && u.EstakadaPlacedAt < toUtc)
                || (u.EstakadaRemovedAt >= fromUtc && u.EstakadaRemovedAt < toUtc)
                || (u.GrossWeighedAt >= fromUtc && u.GrossWeighedAt < toUtc)
                || (u.ScaleExitedAt >= fromUtc && u.ScaleExitedAt < toUtc));

        if (!string.IsNullOrWhiteSpace(product))
        {
            var needle = product.Trim();
            query = query.Where(u => EF.Functions.ILike(u.ProductType, $"%{needle}%"));
        }

        var items = await query
            .OrderBy(u => u.LoadingCompletedAt ?? u.EstakadaRemovedAt ?? u.GrossWeighedAt)
            .Select(u => new SferaLoadingItemDto(
                u.WagonNumber,
                u.CisternNumber,
                u.ProductType,
                u.Status,
                u.EstakadaPlacedAt,
                u.EstakadaRemovedAt,
                u.LoadingStartedAt,
                u.LoadingCompletedAt,
                u.GrossWeighedAt,
                u.ScaleExitedAt,
                u.TareWeight,
                u.GrossWeight,
                u.LoadingBatchNumber,
                u.EmptyWagonArrivalId))
            .ToListAsync(cancellationToken);

        Response.Headers.CacheControl = "no-store";
        return Ok(new ApiResponse<SferaLoadingsResultDto>(true, new SferaLoadingsResultDto(
            from.ToString("yyyy-MM-dd"),
            to.ToString("yyyy-MM-dd"),
            "Asia/Tashkent",
            items.Count,
            items)));
    }

    private static bool TryParseDay(string? raw, out DateTime day)
    {
        day = default;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        return DateTime.TryParseExact(raw.Trim(), "yyyy-MM-dd",
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out day);
    }
}
