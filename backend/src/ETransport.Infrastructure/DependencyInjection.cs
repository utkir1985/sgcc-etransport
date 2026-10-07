using System.Security.Claims;
using System.Text;
using ETransport.Infrastructure.Audit;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Identity;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Notifications;
using ETransport.Infrastructure.Pdf;
using ETransport.Infrastructure.Services;
using ETransport.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace ETransport.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        var dpPath = configuration["DataProtection:KeysPath"] ?? "/var/etransport/dp-keys";
        Directory.CreateDirectory(dpPath);
        services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(dpPath))
            .SetApplicationName("ETransport");

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = configuration["Jwt:Issuer"],
                    ValidAudience = configuration["Jwt:Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(configuration["Jwt:Secret"]!))
                };

                // Imzo va muddat yetarli emas: rol pasaytirilgan, parol almashtirilgan yoki
                // akkaunt o‘chirilgan bo‘lsa, eski token muddati tugaguncha kuchda qolmasligi kerak.
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal;
                        if (!Guid.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                        {
                            context.Fail("Token yaroqsiz");
                            return;
                        }

                        var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                        var current = await db.Users
                            .AsNoTracking()
                            .Where(u => u.Id == userId)
                            .Select(u => new { u.IsActive, u.Role, u.TokenVersion })
                            .FirstOrDefaultAsync(context.HttpContext.RequestAborted);

                        if (current is null || !current.IsActive)
                        {
                            context.Fail("Foydalanuvchi akkaunti faol emas");
                            return;
                        }

                        // Eski (versiyasiz) tokenlar 0-versiya deb qaraladi — birinchi rol yoki
                        // parol o‘zgarishida ular ham kuchini yo‘qotadi.
                        _ = int.TryParse(principal?.FindFirstValue(AuthService.TokenVersionClaim), out var tokenVersion);
                        if (tokenVersion != current.TokenVersion)
                        {
                            context.Fail("Sessiya bekor qilingan — tizimga qaytadan kiring");
                            return;
                        }

                        if (!string.Equals(principal?.FindFirstValue(ClaimTypes.Role), current.Role, StringComparison.Ordinal))
                            context.Fail("Foydalanuvchi roli o‘zgargan — tizimga qaytadan kiring");
                    }
                };
            });

        services.AddHttpContextAccessor();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IMenuService, MenuService>();
        services.AddScoped<IRbacService, RbacService>();
        services.AddScoped<IAuditService, AuditService>();

        services.Configure<TelegramOptions>(configuration.GetSection(TelegramOptions.SectionName));
        services.AddHttpClient("Telegram", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(10);
        });
        services.AddScoped<ITelegramNotificationService, TelegramNotificationService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddHostedService<TelegramMonitoringHostedService>();

        services.AddScoped<IIntegrationCredentialsService, IntegrationCredentialsService>();
        services.AddScoped<IOneCEmptyWagonSyncService, OneCEmptyWagonSyncService>();
        services.AddHostedService<OneCEmptyWagonSyncHostedService>();
        services.AddHostedService<RecycleBinCleanupHostedService>();
        services.AddSingleton<IFileStorageService, LocalFileStorageService>();
        services.AddSingleton<IDocumentPdfGenerator, DocumentPdfGenerator>();

        services.Configure<QrLinkOptions>(configuration.GetSection(QrLinkOptions.SectionName));
        services.AddHttpClient("QrLink", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddScoped<IQrLinkService, QrLinkService>();
        services.AddScoped<QrFinalizationService>();
        services.AddHostedService<QrFinalizationWorker>();
        services.AddScoped<ETransport.Core.Interfaces.IDocumentNumberingService, ETransport.Infrastructure.Services.DocumentNumberingService>();

        return services;
    }
}
