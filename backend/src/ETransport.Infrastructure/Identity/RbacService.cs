using System.Collections.Concurrent;
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
    public const string ReportsViewAction = "reports.view";
    public const string PlansViewAction = "plans.view";

    private static readonly ConcurrentDictionary<string, HashSet<string>> _cache = new(StringComparer.OrdinalIgnoreCase);
    private static volatile bool _isCached = false;
    private static readonly SemaphoreSlim _cacheLock = new(1, 1);

    private static readonly Dictionary<string, string[]> DefaultActionRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        // Plans
        ["plans.read"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Dispatching, UserRoles.DeputyDirector, UserRoles.Management, UserRoles.Economist, UserRoles.Accounting],
        ["plans.create"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Economist],
        ["plans.update"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Economist],
        ["plans.delete"] = [UserRoles.Admin],
        ["plans.approve"] = [UserRoles.Admin, UserRoles.DeputyDirector, UserRoles.Management],
        ["plans.export"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Economist, UserRoles.DeputyDirector],
        ["plans.view"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Dispatching, UserRoles.DeputyDirector, UserRoles.Management],

        // Mahsulot ishlab chiqarish ko'rsatkichlari (Sfera Balance paneli)
        ["sfera.view"] = [UserRoles.Admin, UserRoles.Management, UserRoles.DispatchSupervisor, UserRoles.DeputyDirector],
        ["sfera.update"] = [UserRoles.Admin],
        ["sfera.delete"] = [UserRoles.Admin],
        ["sfera.admin"] = [UserRoles.Admin],

        // Reports
        ["reports.read"] = [UserRoles.Admin, UserRoles.Management, UserRoles.Marketing, UserRoles.Dispatching, UserRoles.Accounting, UserRoles.DeputyDirector, UserRoles.Economist],
        ["reports.create"] = [UserRoles.Admin, UserRoles.Management, UserRoles.DeputyDirector],
        ["reports.update"] = [UserRoles.Admin],
        ["reports.delete"] = [UserRoles.Admin],
        ["reports.export"] = [UserRoles.Admin, UserRoles.Management, UserRoles.Marketing, UserRoles.Dispatching, UserRoles.Accounting, UserRoles.DeputyDirector, UserRoles.Economist],
        ["reports.filter"] = [UserRoles.Admin, UserRoles.Management, UserRoles.Marketing, UserRoles.DeputyDirector],
        ["reports.view"] = [UserRoles.Admin],

        // Orders
        ["orders.read"] = UserRoles.All,
        ["orders.create"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.DispatchSupervisor],
        ["orders.update"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.DispatchSupervisor],
        ["orders.delete"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.DispatchSupervisor],
        ["orders.submit-approval"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.DispatchSupervisor],
        ["orders.resubmit"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.DispatchSupervisor],
        ["orders.submit-dispatch"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.DispatchSupervisor],
        ["orders.accounting-save"] = [UserRoles.Admin, UserRoles.Accounting],
        ["orders.accounting-finalize"] = [UserRoles.Admin, UserRoles.Accounting],
        ["orders.approve-deputy"] = [UserRoles.Admin, UserRoles.DeputyDirector],
        ["orders.approve-dispatch"] = [UserRoles.Admin, UserRoles.DispatchSupervisor, UserRoles.Dispatching],

        // Documents Registry (Yuk xatlari)
        ["documents.registry.read"] = [UserRoles.Admin, UserRoles.Economist, UserRoles.Dispatching, UserRoles.DispatchSupervisor, UserRoles.Railway, UserRoles.Warehouse, UserRoles.Permit, UserRoles.Security, UserRoles.Management, UserRoles.DeputyDirector, UserRoles.Accounting],
        ["documents.registry.create"] = [UserRoles.Admin, UserRoles.Economist],
        ["documents.registry.update"] = [UserRoles.Admin, UserRoles.Economist],
        ["documents.registry.delete"] = [UserRoles.Admin, UserRoles.Economist],
        ["documents.registry.approve-shift"] = [UserRoles.Admin, UserRoles.Dispatching, UserRoles.DispatchSupervisor],
        ["documents.registry.approve-permit"] = [UserRoles.Admin, UserRoles.Permit, UserRoles.Economist, UserRoles.Dispatching],
        ["documents.registry.approve-security"] = [UserRoles.Admin, UserRoles.Security, UserRoles.Economist, UserRoles.Dispatching],
        ["documents.registry.approve-economist"] = [UserRoles.Admin, UserRoles.Economist],
        ["documents.registry.send-external"] = [UserRoles.Admin, UserRoles.Economist],
        ["documents.registry.handover"] = [UserRoles.Admin, UserRoles.Economist, UserRoles.Railway],

        // Empty Wagons (Kirish vagonlari)
        ["empty-wagons.read"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.DispatchSupervisor, UserRoles.Security, UserRoles.Scale, UserRoles.Warehouse, UserRoles.Permit, UserRoles.Economist, UserRoles.Management, UserRoles.DeputyDirector],
        ["empty-wagons.create"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.DispatchSupervisor],
        ["empty-wagons.update"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.DispatchSupervisor],
        ["empty-wagons.delete"] = [UserRoles.Admin, UserRoles.Railway],
        ["empty-wagons.entry-permit"] = [UserRoles.Admin, UserRoles.Railway],
        ["empty-wagons.security-inspect"] = [UserRoles.Admin, UserRoles.Security],
        ["empty-wagons.permit-agree"] = [UserRoles.Admin, UserRoles.Permit],
        ["empty-wagons.dispatch-approve"] = [UserRoles.Admin, UserRoles.Dispatching, UserRoles.DispatchSupervisor],
        ["empty-wagons.transfer-estakada"] = [UserRoles.Admin, UserRoles.Railway],
        ["empty-wagons.defect-act"] = [UserRoles.Admin, UserRoles.Railway],

        // Flow (Yuklash, tarozi, plombalash)
        ["flow.tare-weigh"] = [UserRoles.Admin, UserRoles.Scale],
        ["flow.loading"] = [UserRoles.Admin, UserRoles.Warehouse, UserRoles.Dispatching],
        ["flow.gross-weigh"] = [UserRoles.Admin, UserRoles.Scale],
        ["flow.seal-warehouse"] = [UserRoles.Admin, UserRoles.Warehouse],
        ["flow.seal-scale"] = [UserRoles.Admin, UserRoles.Scale],
        ["flow.seal-security"] = [UserRoles.Admin, UserRoles.Security],
        ["flow.seal-edit"] = [UserRoles.Admin, UserRoles.Scale, UserRoles.Warehouse, UserRoles.Security],

        // References
        ["products.read"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Accounting, UserRoles.Dispatching, UserRoles.Railway, UserRoles.Warehouse, UserRoles.Scale, UserRoles.Management, UserRoles.Economist],
        ["products.create"] = [UserRoles.Admin, UserRoles.Marketing],
        ["products.update"] = [UserRoles.Admin, UserRoles.Marketing],
        ["products.delete"] = [UserRoles.Admin, UserRoles.Marketing],

        ["contractors.read"] = UserRoles.All,
        ["contractors.create"] = [UserRoles.Admin, UserRoles.Marketing],
        ["contractors.update"] = [UserRoles.Admin, UserRoles.Marketing],
        ["contractors.delete"] = [UserRoles.Admin, UserRoles.Marketing],

        ["stations.read"] = [UserRoles.Admin, UserRoles.Marketing, UserRoles.Railway, UserRoles.Dispatching, UserRoles.Accounting, UserRoles.Economist, UserRoles.Management],
        ["stations.create"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Marketing],
        ["stations.update"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Marketing],
        ["stations.delete"] = [UserRoles.Admin, UserRoles.Railway],

        ["wagon-types.read"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.Scale, UserRoles.Warehouse, UserRoles.Economist, UserRoles.Management],
        ["wagon-types.create"] = [UserRoles.Admin, UserRoles.Railway],
        ["wagon-types.update"] = [UserRoles.Admin, UserRoles.Railway],
        ["wagon-types.delete"] = [UserRoles.Admin, UserRoles.Railway],

        ["fleet-wagons.read"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.Scale, UserRoles.Warehouse, UserRoles.Security, UserRoles.Permit, UserRoles.Economist, UserRoles.Management],
        ["fleet-wagons.create"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.DispatchSupervisor],
        ["fleet-wagons.update"] = [UserRoles.Admin, UserRoles.Railway, UserRoles.Dispatching, UserRoles.DispatchSupervisor],
        ["fleet-wagons.delete"] = [UserRoles.Admin, UserRoles.Railway],
    };

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

    private async Task EnsureCacheLoadedAsync()
    {
        if (_isCached) return;

        await _cacheLock.WaitAsync();
        try
        {
            if (_isCached) return;

            var json = await GetConfigJsonAsync();
            _cache.Clear();

            if (!string.IsNullOrWhiteSpace(json))
            {
                try
                {
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("actions", out var actions) && actions.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var action in actions.EnumerateArray())
                        {
                            if (!action.TryGetProperty("key", out var keyProp)) continue;
                            var key = keyProp.GetString();
                            if (string.IsNullOrWhiteSpace(key)) continue;

                            var rolesSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            if (action.TryGetProperty("roles", out var rolesProp) && rolesProp.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var r in rolesProp.EnumerateArray())
                                {
                                    var roleStr = r.GetString();
                                    if (!string.IsNullOrWhiteSpace(roleStr))
                                        rolesSet.Add(roleStr.Trim());
                                }
                            }

                            _cache[key] = rolesSet;
                        }
                    }
                }
                catch (JsonException)
                {
                    // Fallback to defaults
                }
            }

            _isCached = true;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    public static void InvalidateCache()
    {
        _cache.Clear();
        _isCached = false;
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
        InvalidateCache();
    }

    public async Task<string[]> GetActionRolesAsync(string actionKey)
    {
        if (string.IsNullOrWhiteSpace(actionKey)) return [];
        await EnsureCacheLoadedAsync();

        if (_cache.TryGetValue(actionKey, out var roles))
            return roles.ToArray();

        return DefaultActionRoles.TryGetValue(actionKey, out var defaults) ? defaults : [];
    }

    public async Task SetActionRolesAsync(string actionKey, IEnumerable<string> roles)
    {
        var allowed = roles
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r.Trim())
            .Where(r => UserRoles.All.Contains(r, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
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
                    if (string.Equals(prop.Name, "actions", StringComparison.OrdinalIgnoreCase)) continue;
                    root[prop.Name] = prop.Value.Clone();
                }
                if (doc.RootElement.TryGetProperty("actions", out var existing)
                    && existing.ValueKind == JsonValueKind.Array)
                {
                    foreach (var action in existing.EnumerateArray())
                    {
                        var key = action.TryGetProperty("key", out var k) ? k.GetString() : null;
                        if (string.IsNullOrWhiteSpace(key) || string.Equals(key, actionKey, StringComparison.OrdinalIgnoreCase))
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

        if (string.Equals(role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase))
            return true;

        await EnsureCacheLoadedAsync();

        if (_cache.TryGetValue(actionKey, out var roles))
            return roles.Contains(role);

        return DefaultActionRoles.TryGetValue(actionKey, out var defs) && defs.Contains(role, StringComparer.OrdinalIgnoreCase);
    }
}
