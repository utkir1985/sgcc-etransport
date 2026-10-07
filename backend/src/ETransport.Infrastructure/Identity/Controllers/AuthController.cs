using System.Security.Claims;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

using ETransport.Infrastructure.Audit;

namespace ETransport.Infrastructure.Identity.Controllers;

public record DemoUserDto(string Username, string Role);

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AuthController(IAuthService authService, IMenuService menuService, AppDbContext db, IAuditService auditService) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<ActionResult<ApiResponse<LoginResponse>>> Login([FromBody] LoginRequest request)
    {
        var (result, error) = await authService.LoginAsync(request);
        if (result is null)
        {
            var cleanUsername = request.Username?.Trim() ?? "";
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => EF.Functions.ILike(u.Username, cleanUsername));
            await auditService.LogAuthAsync(
                "LoginFailed",
                request.Username,
                "Failed",
                error ?? "Kirish rad etildi",
                userId: user?.Id,
                userFullName: user?.FullName,
                role: user?.Role,
                position: user?.Position,
                department: user?.Department);

            return Unauthorized(new ApiResponse<LoginResponse>(false, null, error ?? "Login yoki parol noto'g'ri"));
        }

        await auditService.LogAuthAsync(
            "LoginSuccess",
            result.Username,
            "Success",
            "Tizimga muvaffaqiyatli kirildi",
            userFullName: result.FullName,
            role: result.Role,
            position: result.Position,
            department: result.Department);

        return Ok(new ApiResponse<LoginResponse>(true, result));
    }

    [HttpGet("demo-users")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<List<DemoUserDto>>>> DemoUsers()
    {
        var users = await db.Users
            .AsNoTracking()
            .Where(u => u.IsActive)
            .OrderBy(u => u.CreatedAt)
            .Select(u => new DemoUserDto(u.Username, u.Role))
            .ToListAsync();

        var result = users
            .GroupBy(u => u.Role, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();
        return Ok(new ApiResponse<List<DemoUserDto>>(true, result));
    }

    [HttpGet("profile")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<UserProfileDto>>> Profile()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var profile = await authService.GetProfileAsync(userId);
        return Ok(new ApiResponse<UserProfileDto>(true, profile));
    }

    [HttpPut("profile")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<UserProfileDto>>> UpdateProfile([FromBody] UpdateOwnProfileRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var (profile, error) = await authService.UpdateProfileAsync(userId, request);
        if (error is not null)
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, error));
        return Ok(new ApiResponse<UserProfileDto>(true, profile));
    }

    [HttpPut("profile/password")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ChangePasswordResultDto>>> ChangePassword([FromBody] ChangeOwnPasswordRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var (ok, error, token, expiresAt) = await authService.ChangePasswordAsync(userId, request);
        if (!ok || token is null || expiresAt is null)
        {
            await auditService.LogAuthAsync("PasswordChangeFailed", User.Identity?.Name ?? "", "Failed", error ?? "Parol almashtirilmadi", userId: userId);
            return BadRequest(new ApiResponse<ChangePasswordResultDto>(false, null, error));
        }

        await auditService.LogAuthAsync("PasswordChanged", User.Identity?.Name ?? "", "Success", "Foydalanuvchi o'z parolini muvaffaqiyatli almashtirdi", userId: userId);
        return Ok(new ApiResponse<ChangePasswordResultDto>(true, new ChangePasswordResultDto(token, expiresAt.Value)));
    }

    [HttpPost("profile/avatar")]
    [Authorize]
    [RequestSizeLimit(600_000)]
    public async Task<ActionResult<ApiResponse<UserProfileDto>>> UploadAvatar(IFormFile? file)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (file is null || file.Length == 0)
        {
            var (cleared, clearErr) = await authService.UpdateAvatarAsync(userId, "");
            if (clearErr is not null)
                return BadRequest(new ApiResponse<UserProfileDto>(false, null, clearErr));
            return Ok(new ApiResponse<UserProfileDto>(true, cleared));
        }

        if (file.Length > 350_000)
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, "Rasm hajmi 300 KB dan oshmasligi kerak"));

        var contentType = file.ContentType?.ToLowerInvariant() ?? "";
        if (contentType is not ("image/jpeg" or "image/jpg" or "image/png" or "image/webp" or "image/gif"))
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, "Faqat JPG, PNG, WEBP yoki GIF"));

        await using var stream = file.OpenReadStream();
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms);
        var b64 = Convert.ToBase64String(ms.ToArray());
        var dataUrl = $"data:{contentType};base64,{b64}";

        var (profile, error) = await authService.UpdateAvatarAsync(userId, dataUrl);
        if (error is not null)
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, error));
        return Ok(new ApiResponse<UserProfileDto>(true, profile));
    }

    [HttpGet("menu")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<MenuItemDto>>>> Menu()
    {
        var role = User.FindFirstValue(ClaimTypes.Role)!;
        return Ok(new ApiResponse<List<MenuItemDto>>(true, await menuService.GetMenuForRoleAsync(role)));
    }
}

public record CreateUserRequest(string Username, string FullName, string? Email, string Role, string Department, string Position, string? DepartmentShortName, string? Password, bool? MustChangePassword = null);
public record UpdateUserRequest(string Username, string FullName, string? Email, string Role, string Department, string Position, string? DepartmentShortName, string? Password, bool? MustChangePassword = null);
public record ResetPasswordRequest(string? NewPassword, bool? MustChangePassword = null);

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = UserRoles.Admin)]
public class UsersController(AppDbContext db, IAuditService auditService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<UserProfileDto>>>> GetAll()
    {
        var users = await db.Users.Select(u =>
            new UserProfileDto(u.Id, u.Username, u.FullName, u.Email, u.Role, u.Department, u.Position, u.DepartmentShortName, u.AvatarUrl, u.MustChangePassword)).ToListAsync();
        return Ok(new ApiResponse<List<UserProfileDto>>(true, users));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<UserProfileDto>>> Create([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username))
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, "Foydalanuvchi nomi bo'sh bo'lishi mumkin emas"));

        var trimmedUsername = request.Username.Trim();
        if (await db.Users.AnyAsync(u => EF.Functions.ILike(u.Username, trimmedUsername)))
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, "Bunday foydalanuvchi nomi allaqachon mavjud"));

        bool mustChange = request.MustChangePassword ?? (string.IsNullOrWhiteSpace(request.Password) || request.Password == "123456");

        var user = new Core.Entities.User
        {
            Id = Guid.NewGuid(),
            Username = request.Username.Trim(),
            FullName = (request.FullName ?? string.Empty).Trim(),
            Email = (request.Email ?? string.Empty).Trim(),
            Role = request.Role,
            Department = request.Department.Trim(),
            Position = (request.Position ?? request.DepartmentShortName ?? string.Empty).Trim(),
            DepartmentShortName = request.DepartmentShortName?.Trim() ?? string.Empty,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(string.IsNullOrWhiteSpace(request.Password) ? "123456" : request.Password),
            MustChangePassword = mustChange,
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            "UserCreated",
            "User",
            user.Id.ToString(),
            $"Yangi foydalanuvchi yaratildi: {user.Username} ({user.FullName}, lavozim: {user.Position}, bo'lim: {user.Department}, rol: {user.Role})",
            category: "UserManagement",
            status: "Success");

        var dto = new UserProfileDto(user.Id, user.Username, user.FullName, user.Email, user.Role, user.Department, user.Position, user.DepartmentShortName, user.AvatarUrl, user.MustChangePassword);
        return Ok(new ApiResponse<UserProfileDto>(true, dto));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<UserProfileDto>>> Update(Guid id, [FromBody] UpdateUserRequest request)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new ApiResponse<UserProfileDto>(false, null, "Foydalanuvchi topilmadi"));

        var username = request.Username.Trim();
        if (string.IsNullOrWhiteSpace(username))
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, "Login bo'sh bo'lishi mumkin emas"));
        if (await db.Users.AnyAsync(u => u.Id != id && EF.Functions.ILike(u.Username, username)))
            return BadRequest(new ApiResponse<UserProfileDto>(false, null, "Bunday login allaqachon mavjud"));

        // Rol yoki parol o‘zgarsa, avval berilgan tokenlar kuchini yo‘qotishi kerak.
        var sessionInvalidated = !string.Equals(user.Role, request.Role, StringComparison.Ordinal)
            || !string.IsNullOrWhiteSpace(request.Password);

        user.Username = username;
        user.FullName = (request.FullName ?? string.Empty).Trim();
        user.Email = request.Email?.Trim() ?? user.Email;
        user.Role = request.Role;
        user.Department = request.Department.Trim();
        user.Position = (request.Position ?? request.DepartmentShortName ?? user.Position).Trim();
        user.DepartmentShortName = request.DepartmentShortName?.Trim() ?? user.DepartmentShortName;

        if (!string.IsNullOrWhiteSpace(request.Password))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        if (request.MustChangePassword.HasValue)
            user.MustChangePassword = request.MustChangePassword.Value;
        else if (!string.IsNullOrWhiteSpace(request.Password))
            user.MustChangePassword = request.Password == "123456";

        if (sessionInvalidated)
            user.TokenVersion++;

        await db.SaveChangesAsync();

        await auditService.LogAsync(
            "UserUpdated",
            "User",
            user.Id.ToString(),
            $"Foydalanuvchi ma'lumotlari tahrirlandi: {user.Username} ({user.FullName}, lavozim: {user.Position}, rol: {user.Role})",
            category: "UserManagement",
            status: "Success");

        var dto = new UserProfileDto(user.Id, user.Username, user.FullName, user.Email, user.Role, user.Department, user.Position, user.DepartmentShortName, user.AvatarUrl, user.MustChangePassword);
        return Ok(new ApiResponse<UserProfileDto>(true, dto));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<bool>>> Delete(Guid id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new ApiResponse<bool>(false, false, "Foydalanuvchi topilmadi"));

        db.Users.Remove(user);
        await db.SaveChangesAsync();

        await auditService.LogAsync(
            "UserDeleted",
            "User",
            id.ToString(),
            $"Foydalanuvchi o'chirildi: {user.Username} ({user.FullName}, rol: {user.Role})",
            category: "UserManagement",
            status: "Success");

        return Ok(new ApiResponse<bool>(true, true));
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<ActionResult<ApiResponse<bool>>> ResetPassword(Guid id, [FromBody] ResetPasswordRequest request)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new ApiResponse<bool>(false, false, "Foydalanuvchi topilmadi"));

        var newPassword = string.IsNullOrWhiteSpace(request.NewPassword) ? "123456" : request.NewPassword;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.MustChangePassword = request.MustChangePassword ?? (newPassword == "123456");
        // Parol admin tomonidan almashtirildi — eski sessiyalar darhol yopiladi,
        // shuningdek oldingi xato urinishlar sababli bloklanish ham olib tashlanadi.
        user.TokenVersion++;
        user.FailedLoginAttempts = 0;
        user.LockoutEnd = null;

        await db.SaveChangesAsync();

        await auditService.LogAsync(
            "UserPasswordReset",
            "User",
            id.ToString(),
            $"Foydalanuvchi paroli admin tomonidan qayta o'rnatildi: {user.Username} ({user.FullName})",
            category: "UserManagement",
            status: "Success");

        return Ok(new ApiResponse<bool>(true, true));
    }

    [HttpPost("logout")]
    public async Task<ActionResult<ApiResponse<bool>>> Logout([FromQuery] string? reason = null)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var username = User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "User";
        var isTimeout = string.Equals(reason, "timeout", StringComparison.OrdinalIgnoreCase);

        await auditService.LogAuthAsync(
            isTimeout ? "SessionTimeout" : "Logout",
            username,
            "Success",
            isTimeout ? "10 daqiqalik harakatsizlik tufayli seans avtomatik yopildi" : "Foydalanuvchi tizimdan chiqdi",
            userId: Guid.TryParse(userIdStr, out var uid) ? uid : null);

        return Ok(new ApiResponse<bool>(true, true));
    }
}
