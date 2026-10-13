using ETransport.Infrastructure.Identity;
using System.Security.Claims;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Dashboard.Controllers;

public record CreateMonthlyPlanDto(
    int Year,
    int Month,
    string FactoryName,
    string ProductType,
    decimal PlanTons,
    int PlanWagons,
    string? Notes
);

public record UpdateMonthlyPlanDto(
    string FactoryName,
    string ProductType,
    decimal PlanTons,
    int PlanWagons,
    string? Notes
);

public record MonthlyPlanProgressDto(
    Guid Id,
    int Year,
    int Month,
    string FactoryName,
    string ProductType,
    decimal PlanTons,
    decimal ActualTons,
    decimal RemainingTons,
    double PercentTons,
    int PlanWagons,
    int ActualWagons,
    int RemainingWagons,
    double PercentWagons,
    string? Notes,
    DateTime CreatedAt,
    string? CreatedByName
);

public record DailyTrendPointDto(
    int Day,
    decimal ActualTons,
    int ActualWagons
);

public record MonthlyPlansOverviewDto(
    int Year,
    int Month,
    decimal TotalPlanTons,
    decimal TotalActualTons,
    decimal TotalRemainingTons,
    double OverallPercentTons,
    int TotalPlanWagons,
    int TotalActualWagons,
    int TotalRemainingWagons,
    double OverallPercentWagons,
    int DaysInMonth,
    int DaysPassed,
    int DaysRemaining,
    decimal DailyTargetTons,
    List<MonthlyPlanProgressDto> Items,
    List<DailyTrendPointDto> DailyTrend
);

[ApiController]
[Route("api/monthly-plans")]
[Authorize]
public class MonthlyPlansController(AppDbContext db) : ControllerBase
{
    private string CurrentUserName() =>
        User.FindFirst("fullName")?.Value
        ?? User.FindFirst(ClaimTypes.Name)?.Value
        ?? "Foydalanuvchi";

    private Guid? CurrentUserId() =>
        Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private static string NormalizeProduct(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "Suyultirilgan gaz";
        var s = raw.Trim().ToLowerInvariant()
            .Replace('а', 'a').Replace('е', 'e').Replace('о', 'o').Replace('р', 'p')
            .Replace('с', 'c').Replace('у', 'y').Replace('х', 'x').Replace('к', 'k')
            .Replace('т', 't').Replace('б', 'b').Replace('и', 'i').Replace('й', 'y')
            .Replace('г', 'g').Replace('з', 'z').Replace('н', 'n').Replace('д', 'd')
            .Replace(' ', ' ');

        if (s.Contains("kondensat")) return "Tabiiy gaz kondensati";
        if (s.Contains("polietilen") || s.Contains("etilen")) return "Etilenning polimerlari (polietilen)";
        if (s.Contains("oltingugurt")) return "Oltingugurt";
        if (s.Contains("gaz")) return "Suyultirilgan gaz";
        return raw.Trim();
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<MonthlyPlansOverviewDto>>> GetPlans(
        [FromQuery] int? year,
        [FromQuery] int? month)
    {
        var targetYear = year ?? DateTime.UtcNow.Year;
        var targetMonth = month ?? DateTime.UtcNow.Month;
        if (targetMonth < 1 || targetMonth > 12) targetMonth = DateTime.UtcNow.Month;

        var startOfMonth = new DateTime(targetYear, targetMonth, 1, 0, 0, 0, DateTimeKind.Utc);
        var endOfMonth = startOfMonth.AddMonths(1);

        var plans = await db.MonthlyPlans
            .Where(p => p.Year == targetYear && p.Month == targetMonth)
            .OrderBy(p => p.FactoryName)
            .ThenBy(p => p.ProductType)
            .ToListAsync();

        var registries = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)
            .Where(r => r.PreparedAt >= startOfMonth && r.PreparedAt < endOfMonth)
            .ToListAsync();

        var actualByProduct = registries
            .GroupBy(r => NormalizeProduct(r.EmptyWagonArrival?.ProductType), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => new
                {
                    Tons = g.Sum(r => r.OrderDeductedNetWeight),
                    Wagons = g.Sum(r => r.OrderDeductedWagons)
                },
                StringComparer.OrdinalIgnoreCase
            );

        var items = new List<MonthlyPlanProgressDto>();
        var matchedProducts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var p in plans)
        {
            var pKey = NormalizeProduct(p.ProductType);
            matchedProducts.Add(pKey);

            decimal actTons = 0;
            int actWagons = 0;

            if (actualByProduct.TryGetValue(pKey, out var act))
            {
                actTons = act.Tons;
                actWagons = act.Wagons;
            }

            var percentTons = p.PlanTons > 0 ? Math.Round((double)(actTons / p.PlanTons) * 100.0, 1) : 0.0;
            var percentWagons = p.PlanWagons > 0 ? Math.Round(((double)actWagons / p.PlanWagons) * 100.0, 1) : 0.0;
            var remTons = Math.Max(0, p.PlanTons - actTons);
            var remWagons = Math.Max(0, p.PlanWagons - actWagons);

            items.Add(new MonthlyPlanProgressDto(
                p.Id,
                p.Year,
                p.Month,
                p.FactoryName,
                p.ProductType ?? "",
                p.PlanTons,
                actTons,
                remTons,
                percentTons,
                p.PlanWagons,
                actWagons,
                remWagons,
                percentWagons,
                p.Notes,
                p.CreatedAt,
                p.CreatedByName
            ));
        }

        foreach (var kvp in actualByProduct)
        {
            if (!matchedProducts.Contains(kvp.Key))
            {
                items.Add(new MonthlyPlanProgressDto(
                    Guid.Empty,
                    targetYear,
                    targetMonth,
                    "Sho'rtan GKM",
                    kvp.Key,
                    0,
                    kvp.Value.Tons,
                    0,
                    100.0,
                    0,
                    kvp.Value.Wagons,
                    0,
                    100.0,
                    "Rejadan tashqari jo'natma",
                    DateTime.UtcNow,
                    "-"
                ));
            }
        }

        var totalPlanTons = items.Sum(i => i.PlanTons);
        var totalActualTons = items.Sum(i => i.ActualTons);
        var totalRemTons = Math.Max(0, totalPlanTons - totalActualTons);
        var overallPercentTons = totalPlanTons > 0 ? Math.Round((double)(totalActualTons / totalPlanTons) * 100.0, 1) : (totalActualTons > 0 ? 100.0 : 0.0);

        var totalPlanWagons = items.Sum(i => i.PlanWagons);
        var totalActualWagons = items.Sum(i => i.ActualWagons);
        var totalRemWagons = Math.Max(0, totalPlanWagons - totalActualWagons);
        var overallPercentWagons = totalPlanWagons > 0 ? Math.Round(((double)totalActualWagons / totalPlanWagons) * 100.0, 1) : (totalActualWagons > 0 ? 100.0 : 0.0);

        var daysInMonth = DateTime.DaysInMonth(targetYear, targetMonth);
        var now = DateTime.UtcNow;
        int daysPassed;
        if (targetYear == now.Year && targetMonth == now.Month)
            daysPassed = now.Day;
        else if (targetYear < now.Year || (targetYear == now.Year && targetMonth < now.Month))
            daysPassed = daysInMonth;
        else
            daysPassed = 0;

        var daysRemaining = Math.Max(0, daysInMonth - daysPassed);
        var dailyTargetTons = daysRemaining > 0 && totalRemTons > 0
            ? Math.Round(totalRemTons / daysRemaining, 1)
            : 0;

        var dailyTrend = registries
            .GroupBy(r => r.PreparedAt.Day)
            .OrderBy(g => g.Key)
            .Select(g => new DailyTrendPointDto(
                g.Key,
                Math.Round(g.Sum(r => r.OrderDeductedNetWeight), 1),
                g.Sum(r => r.OrderDeductedWagons)
            ))
            .ToList();

        var overview = new MonthlyPlansOverviewDto(
            targetYear,
            targetMonth,
            totalPlanTons,
            totalActualTons,
            totalRemTons,
            overallPercentTons,
            totalPlanWagons,
            totalActualWagons,
            totalRemWagons,
            overallPercentWagons,
            daysInMonth,
            daysPassed,
            daysRemaining,
            dailyTargetTons,
            items,
            dailyTrend
        );

        return Ok(new ApiResponse<MonthlyPlansOverviewDto>(true, overview));
    }

    [HttpPost]
    [RequirePermission("plans.create")]
    public async Task<ActionResult<ApiResponse<MonthlyPlan>>> CreatePlan([FromBody] CreateMonthlyPlanDto dto)
    {
        if (dto.Year < 2020 || dto.Year > 2050) return BadRequest(new ApiResponse<MonthlyPlan>(false, null, "Yil noto'g'ri"));
        if (dto.Month < 1 || dto.Month > 12) return BadRequest(new ApiResponse<MonthlyPlan>(false, null, "Oy noto'g'ri"));
        if (string.IsNullOrWhiteSpace(dto.ProductType)) return BadRequest(new ApiResponse<MonthlyPlan>(false, null, "Mahsulot turi kiritilmadi"));
        if (string.IsNullOrWhiteSpace(dto.FactoryName)) return BadRequest(new ApiResponse<MonthlyPlan>(false, null, "Zavod nomi kiritilmadi"));

        var plan = new MonthlyPlan
        {
            Year = dto.Year,
            Month = dto.Month,
            FactoryName = dto.FactoryName.Trim(),
            ProductType = dto.ProductType.Trim(),
            PlanTons = dto.PlanTons,
            PlanWagons = dto.PlanWagons,
            Notes = dto.Notes?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedById = CurrentUserId(),
            CreatedByName = CurrentUserName()
        };

        db.MonthlyPlans.Add(plan);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<MonthlyPlan>(true, plan, "Oylik reja muvaffaqiyatli saqlandi"));
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("plans.update")]
    public async Task<ActionResult<ApiResponse<MonthlyPlan>>> UpdatePlan(Guid id, [FromBody] UpdateMonthlyPlanDto dto)
    {
        var plan = await db.MonthlyPlans.FindAsync(id);
        if (plan is null) return NotFound(new ApiResponse<MonthlyPlan>(false, null, "Reja topilmadi"));

        plan.FactoryName = dto.FactoryName.Trim();
        plan.ProductType = dto.ProductType.Trim();
        plan.PlanTons = dto.PlanTons;
        plan.PlanWagons = dto.PlanWagons;
        plan.Notes = dto.Notes?.Trim();
        plan.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<MonthlyPlan>(true, plan, "Oylik reja yangilandi"));
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("plans.delete")]
    public async Task<ActionResult<ApiResponse<bool>>> DeletePlan(Guid id)
    {
        var plan = await db.MonthlyPlans.FindAsync(id);
        if (plan is null) return NotFound(new ApiResponse<bool>(false, false, "Reja topilmadi"));

        db.MonthlyPlans.Remove(plan);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<bool>(true, true, "Reja o'chirildi"));
    }

    [HttpGet("factories")]
    public async Task<ActionResult<ApiResponse<object>>> GetFactoriesAndProducts()
    {
        var existingFactories = await db.MonthlyPlans
            .Select(p => p.FactoryName)
            .Distinct()
            .ToListAsync();

        if (!existingFactories.Contains("Sho'rtan GKM")) existingFactories.Insert(0, "Sho'rtan GKM");
        if (!existingFactories.Contains("Muborak GQN")) existingFactories.Add("Muborak GQN");
        if (!existingFactories.Contains("Gazli GIB")) existingFactories.Add("Gazli GIB");
        if (!existingFactories.Contains("Ustyurt GKM")) existingFactories.Add("Ustyurt GKM");

        var products = new List<string>
        {
            "Suyultirilgan gaz",
            "Tabiiy gaz kondensati",
            "Etilenning polimerlari (polietilen)",
            "Oltingugurt"
        };

        return Ok(new ApiResponse<object>(true, new { factories = existingFactories, products }));
    }
}
