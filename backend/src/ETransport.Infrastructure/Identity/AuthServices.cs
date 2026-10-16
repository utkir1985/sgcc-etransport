using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace ETransport.Infrastructure.Identity;

public interface IAuthService
{
    Task<(LoginResponse? Response, string? Error)> LoginAsync(LoginRequest request);
    Task<UserProfileDto?> GetProfileAsync(Guid userId);
    Task<(UserProfileDto? Profile, string? Error)> UpdateProfileAsync(Guid userId, UpdateOwnProfileRequest request);
    Task<(bool Ok, string? Error, string? Token, DateTime? ExpiresAt)> ChangePasswordAsync(Guid userId, ChangeOwnPasswordRequest request);
    Task<(UserProfileDto? Profile, string? Error)> UpdateAvatarAsync(Guid userId, string avatarDataUrl);
}

public class AuthService(AppDbContext db, IConfiguration config) : IAuthService
{
    // Qo'pol kuch (brute-force) hujumidan himoya: nginx/backend tezlik cheklovi urinishni
    // sekinlashtiradi, bu esa N marta xato urinishdan keyin hisobni vaqtincha butunlay
    // bloklaydi — ikkalasi birga ishlaydi.
    private const int MaxFailedAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    public async Task<(LoginResponse? Response, string? Error)> LoginAsync(LoginRequest request)
    {
        var username = request.Username?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(request.Password))
            return (null, "Login va parol kiritilishi shart");

        var user = await db.Users.FirstOrDefaultAsync(u => EF.Functions.ILike(u.Username, username));
        if (user is null)
            return (null, "Bunday foydalanuvchi tizimda mavjud emas");

        if (!user.IsActive)
            return (null, "Foydalanuvchi akkaunti faol emas");

        if (user.LockoutEnd.HasValue && user.LockoutEnd.Value > DateTime.UtcNow)
        {
            var minutesLeft = Math.Max(1, (int)Math.Ceiling((user.LockoutEnd.Value - DateTime.UtcNow).TotalMinutes));
            return (null, $"Ko'p xato urinish sababli hisob vaqtincha bloklandi. {minutesLeft} daqiqadan keyin qayta urinib ko'ring.");
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            user.FailedLoginAttempts += 1;
            string error;
            if (user.FailedLoginAttempts >= MaxFailedAttempts)
            {
                user.LockoutEnd = DateTime.UtcNow.Add(LockoutDuration);
                error = $"Ko'p xato urinish sababli hisob {LockoutDuration.TotalMinutes:0} daqiqaga bloklandi.";
            }
            else
            {
                error = "Parol xato";
            }
            await db.SaveChangesAsync();
            return (null, error);
        }

        user.FailedLoginAttempts = 0;
        user.LockoutEnd = null;
        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var expires = DateTime.UtcNow.AddHours(8);
        var token = GenerateToken(user, expires);
        var response = new LoginResponse(
            token,
            user.Username,
            user.FullName,
            user.Role,
            user.Department,
            user.Position,
            user.Email,
            expires,
            user.AvatarUrl ?? "",
            user.MustChangePassword);

        return (response, null);
    }

    public async Task<UserProfileDto?> GetProfileAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId);
        return user is null ? null : ToDto(user);
    }

    public async Task<(UserProfileDto? Profile, string? Error)> UpdateProfileAsync(Guid userId, UpdateOwnProfileRequest request)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return (null, "Foydalanuvchi topilmadi");

        var fullName = request.FullName?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(fullName))
            return (null, "To‘liq ism bo‘sh bo‘lishi mumkin emas");

        user.FullName = fullName;
        await db.SaveChangesAsync();
        return (ToDto(user), null);
    }

    public async Task<(bool Ok, string? Error, string? Token, DateTime? ExpiresAt)> ChangePasswordAsync(Guid userId, ChangeOwnPasswordRequest request)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return (false, "Foydalanuvchi topilmadi", null, null);

        if (string.IsNullOrWhiteSpace(request.CurrentPassword)
            || !BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
            return (false, "Joriy parol noto‘g‘ri", null, null);

        var next = request.NewPassword?.Trim() ?? "";

        if (user.Role != Core.Constants.UserRoles.Admin)
        {
            if (next.Length < 8)
                return (false, "Yangi parol kamida 8 ta belgidan iborat bo‘lishi kerak", null, null);

            if (!next.Any(char.IsUpper))
                return (false, "Parolda kamida bitta katta harf (A-Z) bo‘lishi kerak", null, null);

            if (!next.Any(char.IsLower))
                return (false, "Parolda kamida bitta kichik harf (a-z) bo‘lishi kerak", null, null);

            if (!next.Any(char.IsDigit))
                return (false, "Parolda kamida bitta raqam (0-9) bo‘lishi kerak", null, null);

            if (!next.Any(ch => !char.IsLetterOrDigit(ch)))
                return (false, "Parolda kamida bitta maxsus belgi (!@#$%^&*...) bo‘lishi kerak", null, null);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(next) || next.Length < 3)
                return (false, "Parol kamida 3 ta belgidan iborat bo‘lishi kerak", null, null);
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(next);
        user.MustChangePassword = false;
        // Eski parol bilan berilgan barcha tokenlar kuchini yo‘qotadi; joriy sessiya
        // uzilib qolmasligi uchun shu yerda yangi token beriladi.
        user.TokenVersion++;
        await db.SaveChangesAsync();

        var expires = DateTime.UtcNow.AddHours(12);
        return (true, null, GenerateToken(user, expires), expires);
    }

    public async Task<(UserProfileDto? Profile, string? Error)> UpdateAvatarAsync(Guid userId, string avatarDataUrl)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return (null, "Foydalanuvchi topilmadi");

        user.AvatarUrl = avatarDataUrl ?? "";
        await db.SaveChangesAsync();
        return (ToDto(user), null);
    }

    /// <summary>Tokendagi sessiya versiyasi da'vosi — server tomonda har so‘rovda tekshiriladi.</summary>
    public const string TokenVersionClaim = "tokenVersion";

    private string GenerateToken(User user, DateTime expires)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("fullName", user.FullName),
            new Claim("department", user.Department ?? ""),
            new Claim("position", user.Position ?? ""),
            new Claim(TokenVersionClaim, user.TokenVersion.ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static UserProfileDto ToDto(User user) =>
        new(user.Id, user.Username, user.FullName, user.Email, user.Role, user.Department, user.Position, user.DepartmentShortName, user.AvatarUrl ?? "", user.MustChangePassword);
}

public interface IMenuService
{
    Task<List<MenuItemDto>> GetMenuForRoleAsync(string role);
}

public class MenuService(IRbacService rbacService) : IMenuService
{
    private static MenuItemDto DashboardItem() =>
        new("dashboard", "Boshqaruv paneli", "/dashboard", "LayoutDashboard");

    private static MenuItemDto OrdersItem() =>
        new("orders", "Buyurtmalar", "/orders", "FileText");

    private static MenuItemDto RegistryItem() =>
        new("registry", "Yuk xatlari", "/registry", "FileCheck");

    private static MenuItemDto EmptyWagonsItem(bool standaloneIntake = false) =>
        standaloneIntake
            ? new("empty-wagons", "Vagonlarni kiritish", "/empty-wagons", "ArrowDownToLine")
            : new("empty-wagons", "Kiritish xizmat xatlari", "/empty-wagons", "Factory");

    private static MenuItemDto TransportItem() =>
        new("transport", "Majmuadagi vagonlar", "/transport", "TrainFront");

    private static MenuItemDto HistoryItem() =>
        new("history", "Jarayonlar tarixi", "/history", "History");

    private static MenuItemDto ReportsItem() =>
        new("reports", "Statistika", "/reports", "BarChart3");

    private static MenuItemDto PlansItem() =>
        new("plans", "Reja", "/plans", "TrendingUp");

    /// <summary>
    /// Barcha rollarda 5 ta asosiy panel (frontend daraxtga yig‘adi).
    /// Tarozi, TM/XA va boshqa ish panellari faqat extras orqali qo‘shiladi.
    /// </summary>
    private static List<MenuItemDto> CoreMenu(IReadOnlyList<MenuItemDto>? extras = null, bool standaloneIntake = false)
    {
        var list = new List<MenuItemDto>
        {
            DashboardItem(),
            OrdersItem(),
            RegistryItem(),
            EmptyWagonsItem(standaloneIntake),
            TransportItem(),
            HistoryItem(),
            PlansItem(),
        };
        if (extras is { Count: > 0 })
            list.AddRange(extras);
        return list;
    }

    private static readonly Dictionary<string, List<MenuItemDto>> Menus = new()
    {
        [Core.Constants.UserRoles.Admin] = CoreMenu([
            new("railway-intake", "Vagonlar reestri", "/railway-intake", "Train"),
            new("order-dispatch-approvals", "Ijroga qabul qilish", "/order-dispatch-approvals", "FileCheck"),
            new("order-deputy-approvals", "Buyurtmani tasdiqlash", "/order-deputy-approvals", "FileCheck"),
            new("order-approvals", "Buxgalteriya kelishuvi", "/order-approvals", "FileCheck"),
            new("admin-users", "Foydalanuvchilar", "/admin/users", "Users"),
            new("admin-roles", "Rollar va Huquqlar", "/admin/roles", "Shield"),
            new("admin-references", "Ma'lumotnomalar", "/admin/references", "BookOpen"),
            new("admin-integrations", "Integratsiyalar", "/admin/integrations", "Plug"),
            new("admin-audit", "Audit Log", "/admin/audit", "FileSearch"),
            new("admin-trash", "O‘chirilganlar", "/admin/trash", "Trash2"),
            new("admin-server-status", "Server holati", "/admin/server-status", "Activity"),
        ]),
        [Core.Constants.UserRoles.Marketing] = CoreMenu(),
        [Core.Constants.UserRoles.MarketingStaff] = CoreMenu(),
        [Core.Constants.UserRoles.Dispatching] = CoreMenu(),
        [Core.Constants.UserRoles.DispatchSupervisor] = CoreMenu([
            new("order-dispatch-approvals", "Ijroga qabul qilish", "/order-dispatch-approvals", "FileCheck"),
        ]),
        [Core.Constants.UserRoles.Accounting] = CoreMenu([
            new("order-approvals", "Buxgalteriya kelishuvi", "/order-approvals", "FileCheck"),
        ]),
        [Core.Constants.UserRoles.Railway] = CoreMenu([
            new("railway-intake", "Vagonlar reestri", "/railway-intake", "Train"),
        ], standaloneIntake: true),
        [Core.Constants.UserRoles.Road] = CoreMenu(),
        [Core.Constants.UserRoles.Warehouse] = CoreMenu([
            new("loading", "Yuklash (TM va XA)", "/loading", "PackageOpen"),
        ]),
        [Core.Constants.UserRoles.Scale] = CoreMenu([
            new("weighing", "Tarozida tortish", "/weighing", "Scale"),
            new("seals", "Plomba o'rnatishga", "/seals", "Lock"),
        ]),
        [Core.Constants.UserRoles.Permit] = CoreMenu([
            new("registry-agree-permit", "Yuk xatini kelishish", "/registry/agree/permit", "FileCheck"),
        ]),
        [Core.Constants.UserRoles.Security] = CoreMenu([
            new("seals", "Plomba o'rnatishga", "/seals", "Lock"),
            new("registry-agree-security", "Yuk xatini kelishish", "/registry/agree/security", "ShieldCheck"),
        ]),
        [Core.Constants.UserRoles.Economist] = CoreMenu([
            new("seals", "Plomba o'rnatish", "/seals", "Lock"),
            new("registry-create", "Yuk xati shakllantirish", "/registry/create", "FileText"),
        ]),
        [Core.Constants.UserRoles.Management] = CoreMenu(),
        [Core.Constants.UserRoles.DeputyDirector] = CoreMenu([
            new("order-deputy-approvals", "Buyurtmani tasdiqlash", "/order-deputy-approvals", "FileCheck"),
        ]),
    };

    public async Task<List<MenuItemDto>> GetMenuForRoleAsync(string role)
    {
        var menu = Menus.TryGetValue(role, out var found) ? found : Menus[Core.Constants.UserRoles.Marketing];
        var result = new List<MenuItemDto>(menu);

        // Statistika sahifasi rol bo‘yicha boshqariladi: ruxsati bo‘lgan rolgagina qo‘shiladi.
        if (await rbacService.HasActionAsync(role, RbacService.ReportsViewAction))
        {
            var afterHistory = result.FindIndex(x => x.Key == "history");
            if (afterHistory >= 0) result.Insert(afterHistory + 1, ReportsItem());
            else result.Add(ReportsItem());
        }

        // Reja sahifasi rol bo‘yicha boshqariladi («Rollar va Huquqlar → Sahifa ko‘rinishi»).
        if (await rbacService.HasActionAsync(role, RbacService.PlansViewAction))
        {
            var afterReports = result.FindIndex(x => x.Key == "reports");
            if (afterReports >= 0) result.Insert(afterReports + 1, PlansItem());
            else
            {
                var afterHistory = result.FindIndex(x => x.Key == "history");
                if (afterHistory >= 0) result.Insert(afterHistory + 1, PlansItem());
                else result.Add(PlansItem());
            }
        }

        return result;
    }
}
