using System.Security.Claims;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace ETransport.Infrastructure.Identity;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class RequirePermissionAttribute : Attribute, IAsyncActionFilter
{
    public string Permission { get; }
    public string[]? AlternativePermissions { get; }

    public RequirePermissionAttribute(string permission, params string[] alternatives)
    {
        Permission = permission;
        AlternativePermissions = alternatives;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var role = user.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

        // Admin har doim barcha amallarga ruxsatga ega
        if (string.Equals(role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        var rbacService = context.HttpContext.RequestServices.GetRequiredService<IRbacService>();

        if (await rbacService.HasActionAsync(role, Permission))
        {
            await next();
            return;
        }

        if (AlternativePermissions != null && AlternativePermissions.Length > 0)
        {
            foreach (var alt in AlternativePermissions)
            {
                if (await rbacService.HasActionAsync(role, alt))
                {
                    await next();
                    return;
                }
            }
        }

        context.Result = new ObjectResult(new ApiResponse<object>(false, null, $"Sizda ushbu amalni bajarish uchun yetarli vakolat yo'q ({Permission})"))
        {
            StatusCode = StatusCodes.Status403Forbidden
        };
    }
}
