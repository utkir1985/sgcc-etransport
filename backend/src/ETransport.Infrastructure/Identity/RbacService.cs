using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Identity;

public interface IRbacService
{
    Task<string?> GetConfigJsonAsync();
    Task SaveConfigJsonAsync(string json);
    Task<bool> HasActionAsync(string role, string actionKey);
    Task<string[]> GetActionRolesAsync(string actionKey);
    Task SetActionRolesAsync(string actionKey, IEnumerable<string> roles);
}

public class RbacService(AppDbContext db) : IRbacService
{
    public const string SettingsKey = "rbac.config";

    private static readonly Dictionary<string, string[]> DefaultActionRoles = new()
    {
        ["orders.read"] = UserRoles.All,
        ["orders.create"] = [UserRoles.Admin, UserRoles.Marketing],
        ["orders.update"] = [UserRoles.Admin, UserRoles.Marketing],
        ["orders.delete"] = [UserRoles.Admin, UserRoles.Marketing],
        ["orders.submit-approval"] = [UserRoles.Admin, UserRoles.Marketing],
        ["orders.resubmit"] = [UserRoles.Admin, UserRoles.Marketing],
        ["orders.submit-dispatch"] = [UserRoles.Admin, UserRoles.Marketing],
        ["orders.approve-deputy"] = [UserRoles.Admin, UserRoles.DeputyDirector],
        ["orders.accounting-save"] = [UserRoles.Admin, UserRoles.Accounting],
        ["orders.accounting-finalize"] = [UserRoles.Admin, UserRoles.Accounting],
        ["orders.approve-dispatch"] = [UserRoles.Admin, UserRoles.DispatchSupervisor],
        ["documents.registry.approve-shift"] = [UserRoles.Admin, UserRoles.Dispatching],
        // Statistika sahifasi — boshida faqat Admin. Admin qaysi rollar ko‘rishini
        // «Rollar va Huquqlar → Sahifa ko‘rinishi» bo‘limidan boshqaradi.
        ["reports.view"] = [UserRoles.Admin],
        ["plans.view"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Dispatching, UserRoles.DeputyDirector, UserRoles.Management],
    };

    /// <summary>Rol bo‘yicha boshqariladigan sahifalar — admin UI shu ro‘yxatdan foydalanadi.</summary>
    public const string ReportsViewAction = "reports.view";
    public const string PlansViewAction = "plans.view";

    private async Task EnsureTableExistsAsync()
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "SystemSettings" (
                    "Key" character varying(100) NOT NULL,
                    "Value" text NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_SystemSettings" PRIMARY KEY ("Key")
                );
                """);
        }
        catch
        {
            // Ignore DB creation errors if database is initializing
        }
    }

    public async Task<string?> GetConfigJsonAsync()
    {
        try
        {
            var row = await db.SystemSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.Key == SettingsKey);
            return row?.Value;
        }
        catch
        {
            await EnsureTableExistsAsync();
            try
            {
                var row = await db.SystemSettings.AsNoTracking()
                    .FirstOrDefaultAsync(s => s.Key == SettingsKey);
                return row?.Value;
            }
            catch
            {
                return null;
            }
        }
    }

    public async Task SaveConfigJsonAsync(string json)
    {
        await EnsureTableExistsAsync();
        var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == SettingsKey);
        if (row is null)
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = SettingsKey,
                Value = json,
                UpdatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            row.Value = json;
            row.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
    }

    /// <summary>Amal uchun ruxsat etilgan rollar — sozlama bo‘lmasa, standart ro‘yxat.</summary>
    public async Task<string[]> GetActionRolesAsync(string actionKey)
    {
        var json = await GetConfigJsonAsync();
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("actions", out var actions)
                    && actions.ValueKind == JsonValueKind.Array)
                {
                    foreach (var action in actions.EnumerateArray())
                    {
                        if (!action.TryGetProperty("key", out var keyProp)) continue;
                        if (!string.Equals(keyProp.GetString(), actionKey, StringComparison.Ordinal)) continue;
                        if (!action.TryGetProperty("roles", out var rolesProp)
                            || rolesProp.ValueKind != JsonValueKind.Array)
                            return [];
                        return rolesProp.EnumerateArray()
                            .Select(x => x.GetString())
                            .Where(x => !string.IsNullOrWhiteSpace(x))
                            .Select(x => x!)
                            .ToArray();
                    }
                }
            }
            catch (JsonException)
            {
                // sozlama buzilgan — standartga qaytamiz
            }
        }

        return DefaultActionRoles.TryGetValue(actionKey, out var defaults) ? defaults : [];
    }

    /// <summary>
    /// Amal uchun rollarni yozadi. Sozlamaning qolgan qismi saqlanadi — faqat shu amal
    /// yangilanadi yoki qo‘shiladi.
    /// </summary>
    public async Task SetActionRolesAsync(string actionKey, IEnumerable<string> roles)
    {
        var allowed = roles
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r.Trim())
            .Where(r => UserRoles.All.Contains(r))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var root = new Dictionary<string, JsonElement>();
        var actions = new List<Dictionary<string, object>>();

        var json = await GetConfigJsonAsync();
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    if (string.Equals(prop.Name, "actions", StringComparison.Ordinal)) continue;
                    root[prop.Name] = prop.Value.Clone();
                }
                if (doc.RootElement.TryGetProperty("actions", out var existing)
                    && existing.ValueKind == JsonValueKind.Array)
                {
                    foreach (var action in existing.EnumerateArray())
                    {
                        var key = action.TryGetProperty("key", out var k) ? k.GetString() : null;
                        if (string.IsNullOrWhiteSpace(key) || string.Equals(key, actionKey, StringComparison.Ordinal))
                            continue;
                        var existingRoles = action.TryGetProperty("roles", out var rr) && rr.ValueKind == JsonValueKind.Array
                            ? rr.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToList()
                            : [];
                        actions.Add(new Dictionary<string, object> { ["key"] = key!, ["roles"] = existingRoles });
                    }
                }
            }
            catch (JsonException)
            {
                // buzilgan sozlama o‘rniga yangisini yozamiz
            }
        }

        actions.Add(new Dictionary<string, object> { ["key"] = actionKey, ["roles"] = allowed });

        var payload = new Dictionary<string, object>();
        foreach (var (key, value) in root) payload[key] = value;
        payload["actions"] = actions;

        await SaveConfigJsonAsync(JsonSerializer.Serialize(payload));
    }

    public async Task<bool> HasActionAsync(string role, string actionKey)
    {
        if (string.IsNullOrWhiteSpace(role) || string.IsNullOrWhiteSpace(actionKey))
            return false;

        var json = await GetConfigJsonAsync();
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("actions", out var actions)
                    && actions.ValueKind == JsonValueKind.Array)
                {
                    foreach (var action in actions.EnumerateArray())
                    {
                        if (!action.TryGetProperty("key", out var keyProp)) continue;
                        if (!string.Equals(keyProp.GetString(), actionKey, StringComparison.Ordinal)) continue;
                        if (!action.TryGetProperty("roles", out var rolesProp)
                            || rolesProp.ValueKind != JsonValueKind.Array)
                            return false;

                        foreach (var r in rolesProp.EnumerateArray())
                        {
                            if (string.Equals(r.GetString(), role, StringComparison.Ordinal))
                                return true;
                        }

                        return false;
                    }
                }
            }
            catch (JsonException)
            {
                // fallback to defaults
            }
        }

        return DefaultActionRoles.TryGetValue(actionKey, out var roles) && roles.Contains(role);
    }
}
