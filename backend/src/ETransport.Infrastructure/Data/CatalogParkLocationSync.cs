using System.Text.RegularExpressions;
using ETransport.Core.Constants;
using ETransport.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Data;

/// <summary>
/// Reestr holati: majmuaga kirganda manzil = ShGKM; chiqganda SHGKM olib tashlanadi.
/// </summary>
public static class CatalogParkLocationSync
{
    public const string OnSiteStation = "ShGKM";
    private static readonly Regex DigitsOnly = new(@"\D", RegexOptions.Compiled);
    private static readonly Regex MultiSpace = new(@"\s+", RegexOptions.Compiled);

    public static async Task UpsertWagonsOnSiteAsync(
        AppDbContext db,
        IReadOnlyList<string> wagonNumbers,
        IReadOnlyList<string> ownerships,
        IReadOnlyList<string>? wagonKinds = null,
        string defaultWagonKind = "sisterna")
    {
        var now = DateTime.UtcNow;
        for (var i = 0; i < wagonNumbers.Count; i++)
        {
            var number = NormalizeWagonNumber(wagonNumbers[i]);
            if (number.Length != 8) continue;

            var ownership = i < ownerships.Count
                ? WagonOwnership.Normalize(ownerships[i])
                : WagonOwnership.Tashqi;
            var kind = wagonKinds is not null && i < wagonKinds.Count && !string.IsNullOrWhiteSpace(wagonKinds[i])
                ? wagonKinds[i].Trim().ToLowerInvariant()
                : defaultWagonKind;

            var existing = await db.CatalogFleetWagons.FirstOrDefaultAsync(w => w.WagonNumber == number);
            if (existing is null)
            {
                db.CatalogFleetWagons.Add(new CatalogFleetWagon
                {
                    WagonNumber = number,
                    Ownership = ownership,
                    WagonKind = kind,
                    DestinationStation = OnSiteStation,
                    DaysInTransit = 0,
                    SentAt = now.Date,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
            else
            {
                // Agar vagon Majmua parki reestrida allaqachon Majmuaga tegishli bo‘lsa,
                // operatsion qabul jarayonidagi qiymat sabab uni 'tashqi'ga aylantirmaslik kerak.
                if (!string.Equals(existing.Ownership, WagonOwnership.Majmua, StringComparison.OrdinalIgnoreCase))
                {
                    existing.Ownership = ownership;
                }
                existing.WagonKind = kind;
                existing.DestinationStation = OnSiteStation;
                existing.DaysInTransit = 0;
                existing.SentAt = now.Date;
                existing.IsActive = true;
                existing.UpdatedAt = now;
            }
        }
    }

    public static async Task MarkWagonsDepartedAsync(AppDbContext db, IEnumerable<string> wagonNumbers)
    {
        var now = DateTime.UtcNow;
        foreach (var raw in wagonNumbers)
        {
            var number = NormalizeWagonNumber(raw);
            if (number.Length != 8) continue;
            var existing = await db.CatalogFleetWagons.FirstOrDefaultAsync(w => w.WagonNumber == number);
            if (existing is null) continue;

            // Tashqi vagonlar Majmuaga tegishli emas — zavoddan chiqishi bilan reestrdan butunlay tozalanadi (nofaol qilinadi)
            if (!string.Equals(existing.Ownership, WagonOwnership.Majmua, StringComparison.OrdinalIgnoreCase))
            {
                existing.IsActive = false;
                existing.DestinationStation = null;
                existing.UpdatedAt = now;
            }
            else
            {
                if (string.Equals(existing.DestinationStation, OnSiteStation, StringComparison.OrdinalIgnoreCase))
                    existing.DestinationStation = null;
                existing.SentAt = now.Date;
                existing.DaysInTransit = 0;
                existing.UpdatedAt = now;
            }
        }
    }

    public static async Task UpsertContainersOnSiteAsync(AppDbContext db, IEnumerable<string> containerNumbers)
    {
        var now = DateTime.UtcNow;
        foreach (var raw in containerNumbers)
        {
            var number = NormalizeContainerNumber(raw);
            if (string.IsNullOrEmpty(number)) continue;

            var existing = await db.CatalogContainers.FirstOrDefaultAsync(c => c.ContainerNumber == number);
            if (existing is null)
            {
                db.CatalogContainers.Add(new CatalogContainer
                {
                    ContainerNumber = number,
                    DestinationStation = OnSiteStation,
                    DaysInTransit = 0,
                    SentAt = now.Date,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
            else
            {
                existing.DestinationStation = OnSiteStation;
                existing.DaysInTransit = 0;
                existing.SentAt = now.Date;
                existing.IsActive = true;
                existing.UpdatedAt = now;
            }
        }
    }

    public static async Task MarkContainersDepartedAsync(AppDbContext db, IEnumerable<string> containerNumbers)
    {
        var now = DateTime.UtcNow;
        foreach (var raw in containerNumbers)
        {
            var number = NormalizeContainerNumber(raw);
            if (string.IsNullOrEmpty(number)) continue;
            var existing = await db.CatalogContainers.FirstOrDefaultAsync(c => c.ContainerNumber == number);
            if (existing is null) continue;
            if (string.Equals(existing.DestinationStation, OnSiteStation, StringComparison.OrdinalIgnoreCase))
                existing.DestinationStation = null;
            existing.SentAt = now.Date;
            existing.DaysInTransit = 0;
            existing.UpdatedAt = now;
        }
    }

    public static string NormalizeWagonNumber(string? value) =>
        DigitsOnly.Replace(value ?? "", "");

    public static string NormalizeContainerNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return MultiSpace.Replace(value.Trim().ToUpperInvariant(), " ");
    }
}
