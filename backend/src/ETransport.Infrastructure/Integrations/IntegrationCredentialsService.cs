using System.Security.Cryptography;
using System.Text;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Integrations;

public interface IIntegrationCredentialsService
{
    Task<OneCCredentialsSnapshot> GetOneCAsync(CancellationToken ct = default);
    Task SaveOneCAsync(string baseUrl, string username, string? newPassword, CancellationToken ct = default);
    Task<OneCCredentialsResolved?> ResolveOneCForCallAsync(CancellationToken ct = default);
}

public record OneCCredentialsSnapshot(
    string BaseUrl,
    string Username,
    bool PasswordConfigured,
    string Source,
    DateTime? UpdatedAt
);

public record OneCCredentialsResolved(string BaseUrl, string Username, string Password);

public class IntegrationCredentialsService(
    AppDbContext db,
    IDataProtectionProvider dataProtection,
    IConfiguration configuration,
    ILogger<IntegrationCredentialsService> logger) : IIntegrationCredentialsService
{
    public const string KeyBaseUrl = "integrations.1c.baseUrl";
    public const string KeyUsername = "integrations.1c.username";
    public const string KeyPassword = "integrations.1c.password";
    private const string ProtectorPurpose = "ETransport.IntegrationSecrets.v1";
    private const string DefaultBaseUrl = "https://buh64.securelab.uz/buh64/hs/vesii/dannie_po_vesam";

    private IDataProtector Protector => dataProtection.CreateProtector(ProtectorPurpose);

    public async Task<OneCCredentialsSnapshot> GetOneCAsync(CancellationToken ct = default)
    {
        var map = await LoadMapAsync(ct);
        var envUser = configuration["OneCScales:Username"]?.Trim() ?? "";
        var envPass = configuration["OneCScales:Password"]?.Trim() ?? "";
        var envUrl = configuration["OneCScales:BaseUrl"]?.Trim() ?? "";

        var baseUrl = FirstNonEmpty(map.GetValueOrDefault(KeyBaseUrl)?.Value, envUrl, DefaultBaseUrl);
        var username = FirstNonEmpty(map.GetValueOrDefault(KeyUsername)?.Value, envUser);
        var hasDbPassword = !string.IsNullOrWhiteSpace(map.GetValueOrDefault(KeyPassword)?.Value);
        var hasEnvPassword = !string.IsNullOrWhiteSpace(envPass);

        var source = hasDbPassword ? "database"
            : hasEnvPassword ? "environment"
            : "none";

        DateTime? updated = map.Values
            .Select(v => (DateTime?)v.UpdatedAt)
            .DefaultIfEmpty(null)
            .Max();

        return new OneCCredentialsSnapshot(
            baseUrl,
            username,
            hasDbPassword || hasEnvPassword,
            source,
            updated);
    }

    public async Task SaveOneCAsync(string baseUrl, string username, string? newPassword, CancellationToken ct = default)
    {
        var url = (baseUrl ?? "").Trim();
        var user = (username ?? "").Trim();
        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("1C URL majburiy");
        if (string.IsNullOrWhiteSpace(user))
            throw new InvalidOperationException("1C login majburiy");

        await UpsertAsync(KeyBaseUrl, url, encrypt: false, ct);
        await UpsertAsync(KeyUsername, user, encrypt: false, ct);

        if (!string.IsNullOrWhiteSpace(newPassword))
        {
            var cipher = Protector.Protect(newPassword.Trim());
            await UpsertAsync(KeyPassword, cipher, encrypt: false, ct); // already ciphertext
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<OneCCredentialsResolved?> ResolveOneCForCallAsync(CancellationToken ct = default)
    {
        var map = await LoadMapAsync(ct);
        var envUser = configuration["OneCScales:Username"]?.Trim() ?? "";
        var envPass = configuration["OneCScales:Password"]?.Trim() ?? "";
        var envUrl = configuration["OneCScales:BaseUrl"]?.Trim() ?? "";

        var baseUrl = FirstNonEmpty(map.GetValueOrDefault(KeyBaseUrl)?.Value, envUrl, DefaultBaseUrl);
        var username = FirstNonEmpty(map.GetValueOrDefault(KeyUsername)?.Value, envUser);

        string? password = null;
        var cipher = map.GetValueOrDefault(KeyPassword)?.Value;
        if (!string.IsNullOrWhiteSpace(cipher))
        {
            try
            {
                password = Protector.Unprotect(cipher);
            }
            catch (CryptographicException ex)
            {
                logger.LogError(ex, "1C parolini ochib bo‘lmadi — qayta saqlash kerak");
            }
        }

        if (string.IsNullOrWhiteSpace(password))
            password = envPass;

        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return null;

        return new OneCCredentialsResolved(baseUrl, username, password);
    }

    private async Task<Dictionary<string, SystemSetting>> LoadMapAsync(CancellationToken ct)
    {
        var keys = new[] { KeyBaseUrl, KeyUsername, KeyPassword };
        var rows = await db.SystemSettings.AsNoTracking()
            .Where(s => keys.Contains(s.Key))
            .ToListAsync(ct);
        return rows.ToDictionary(r => r.Key, StringComparer.Ordinal);
    }

    private async Task UpsertAsync(string key, string value, bool encrypt, CancellationToken ct)
    {
        var store = encrypt ? Protector.Protect(value) : value;
        var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row is null)
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = key,
                Value = store,
                UpdatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            row.Value = store;
            row.UpdatedAt = DateTime.UtcNow;
        }
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
        }
        return "";
    }
}
