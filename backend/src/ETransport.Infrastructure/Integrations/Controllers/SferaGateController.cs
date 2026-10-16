using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ETransport.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace ETransport.Infrastructure.Integrations.Controllers;

/// <summary>
/// Sfera Balance (alohida tizim) kirish nazorati. Sfera tarmoqqa to'g'ridan-to'g'ri ochiq emas:
/// nginx (:8010) har bir so'rovda <c>check</c> ga murojaat qiladi va faqat E-Transport'ga login qilgan,
/// <c>sfera.view</c> huquqi bor foydalanuvchini o'tkazadi. Cookie imzolangan, HttpOnly.
/// </summary>
[ApiController]
[Route("api/integrations/sfera")]
public class SferaGateController(IConfiguration configuration, IRbacService rbac) : ControllerBase
{
    private const string CookieName = "et_sfera";
    private static readonly TimeSpan MaxLifetime = TimeSpan.FromHours(8);

    /// <summary>E-Transport sahifasi Sfera panelini ochishdan oldin chaqiradi — kirish cookie'sini beradi.</summary>
    [HttpPost("session")]
    [Authorize]
    [RequirePermission("sfera.view", "sfera.admin")]
    public IActionResult OpenSession()
    {
        var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var expires = DateTimeOffset.UtcNow.Add(MaxLifetime);
        // E-Transport sessiyasidan uzoq yashamasin
        if (long.TryParse(User.FindFirstValue("exp"), out var jwtExp))
        {
            var jwtExpires = DateTimeOffset.FromUnixTimeSeconds(jwtExp);
            if (jwtExpires < expires) expires = jwtExpires;
        }

        var payload = JsonSerializer.Serialize(new
        {
            sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? string.Empty,
            role,
            exp = expires.ToUnixTimeSeconds(),
        });
        var body = Base64Url(Encoding.UTF8.GetBytes(payload));
        Response.Cookies.Append(CookieName, $"{body}.{Sign(body)}", new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            Secure = Request.IsHttps,
            Path = "/",
            Expires = expires,
        });
        Response.Headers.CacheControl = "no-store";
        return NoContent();
    }

    /// <summary>E-Transport'dan chiqishda Sfera kirishini ham yopadi.</summary>
    [HttpDelete("session")]
    [AllowAnonymous]
    public IActionResult CloseSession()
    {
        Response.Cookies.Delete(CookieName, new CookieOptions { Path = "/" });
        return NoContent();
    }

    /// <summary>nginx auth_request: 204 — o'tkazish (X-Sfera-Admin: 1|0), 401 — rad etish.</summary>
    [HttpGet("check")]
    [AllowAnonymous]
    public async Task<IActionResult> Check()
    {
        var raw = Request.Cookies[CookieName];
        if (string.IsNullOrEmpty(raw)) return Unauthorized();
        var dot = raw.IndexOf('.');
        if (dot <= 0) return Unauthorized();
        var body = raw[..dot];
        var signature = raw[(dot + 1)..];
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(body)), Encoding.ASCII.GetBytes(signature)))
            return Unauthorized();

        string role;
        try
        {
            using var doc = JsonDocument.Parse(FromBase64Url(body));
            if (doc.RootElement.GetProperty("exp").GetInt64() < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return Unauthorized();
            role = doc.RootElement.GetProperty("role").GetString() ?? string.Empty;
        }
        catch
        {
            return Unauthorized();
        }

        // Huquq olib qo'yilsa, darhol amal qiladi
        var canAdmin = await rbac.HasActionAsync(role, "sfera.admin");
        var canView = canAdmin || await rbac.HasActionAsync(role, "sfera.view");
        if (!canView) return Unauthorized();

        // Sfera CRUD huquqlarini alohida biladi: ko'rish, sozlash, o'chirish, texnik bo'limlar.
        // "admin" qolgan uchtasini o'z ichiga oladi.
        var rights = new List<string> { "view" };
        if (canAdmin || await rbac.HasActionAsync(role, "sfera.update")) rights.Add("update");
        if (canAdmin || await rbac.HasActionAsync(role, "sfera.delete")) rights.Add("delete");
        if (canAdmin) rights.Add("admin");

        Response.Headers["X-Sfera-Admin"] = canAdmin ? "1" : "0";
        Response.Headers["X-Sfera-Perms"] = string.Join(",", rights);
        return NoContent();
    }

    private string Sign(string body)
    {
        var secret = configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret sozlanmagan");
        // JWT kalitidan alohida maqsadli kalit hosil qilinadi
        var key = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes("sfera-gate-v1"));
        return Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(body))).ToLowerInvariant();
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string s)
    {
        var b = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(b.PadRight(b.Length + (4 - b.Length % 4) % 4, '='));
    }
}
