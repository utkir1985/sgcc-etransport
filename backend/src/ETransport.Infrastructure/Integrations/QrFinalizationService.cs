using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Pdf;
using ETransport.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Integrations;

public record QrSyncResult(int Uploaded, int Unchanged, int Failed);

/// <summary>Database-backed reconciliation: a fingerprint is saved only after the final PDF is accepted.</summary>
public sealed class QrFinalizationService(AppDbContext db, IQrLinkService qr,
    IDocumentPdfGenerator pdf, IFileStorageService storage, ILogger<QrFinalizationService> logger)
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static string Hash(object model) => Convert.ToHexString(SHA256.HashData(
        Encoding.UTF8.GetBytes((model is YukXatiPdfModel ? "final-pdf-v3:" : "final-pdf-v1:") + JsonSerializer.Serialize(model))));
    private static string Name(params string?[] names) => names.FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "Mas'ul xodim";

    public async Task<QrSyncResult> SyncAsync(CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try { return await SyncCoreAsync(ct); }
        finally { Gate.Release(); }
    }

    private async Task<QrSyncResult> SyncCoreAsync(CancellationToken ct)
    {
        int uploaded = 0, unchanged = 0, failed = 0;
        async Task Process(string number, Func<Task<bool>> action)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                if (await action()) { uploaded++; logger.LogInformation("Final QR PDF uploaded: {Document}", number); }
                else unchanged++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                failed++;
                logger.LogError(ex, "Final QR PDF pending retry: {Document}", number);
                // Never allow a later SaveChanges to persist a failed upload's completion marker.
                db.ChangeTracker.Clear();
            }
        }

        // Load separately per document to isolate failures and avoid saving another document's state.
        var ids = await db.LoadingRegistries.AsNoTracking()
            .Where(r => r.IsApprovedByPermit && r.IsApprovedBySecurity
                && !r.RegistryNumber.StartsWith("1C-") && !r.RegistryNumber.StartsWith("YX-1C-"))
            .OrderByDescending(r => r.PreparedAt).Select(r => r.Id).ToListAsync(ct);
        foreach (var id in ids)
        {
            await Process(id.ToString(), async () =>
            {
                var r = await db.LoadingRegistries.Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
                    .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.CreatedBy).SingleAsync(r => r.Id == id, ct);
                if (!r.IsApprovedByPermit || !r.IsApprovedBySecurity) return false;
                var model = FinalDocumentModels.BuildYukXatiPdfModel(r);
                if (r.QrFinalFileHash == Hash(model)) return false;
                if (model.Signers == null || model.Signers.Count != 5 || model.Signers.Any(s =>
                    !s.At.HasValue || string.IsNullOrWhiteSpace(s.Name) || s.Name == "—" || s.Status == "Kutilmoqda"))
                    throw new InvalidOperationException("Yakuniy yuk xatida tasdiqlovchi F.I.Sh. yoki sana mavjud emas.");
                var request = new QrLinkRegisterRequest(r.RegistryNumber, "Yuk xati", $"Yuk xati № {r.RegistryNumber}",
                    OwnerName: Name(r.SecurityApprovedByName, r.PreparedByName));
                var identity = await ReserveAsync(request, ct);
                model = model with { QrGlobalId = identity.GlobalId, QrVerificationUrl = identity.VerificationUrl };
                var result = await UploadAsync(request, identity, pdf.GenerateYukXatiPdf(model), $"YukXati_{r.RegistryNumber}.pdf", ct);
                r.QrGlobalId = result.GlobalId; r.QrVerificationUrl = result.VerificationUrl;
                r.QrCodeBase64 = result.QrCodeBase64; r.QrRegisteredAt = result.RegisteredAt;
                r.QrFinalFileHash = Hash(model);
                await db.SaveChangesAsync(ct);
                return true;
            });
            db.ChangeTracker.Clear();
        }

        var permits = await db.EmptyWagonArrivals.AsNoTracking().Where(a =>
            a.EntryPermitShiftApprovedAt != null && a.EntryPermitPermitApprovedAt != null && a.EntryPermitSecurityApprovedAt != null
            && !a.ArrivalNumber.StartsWith("1C-") && (a.EntryPermitNumber == null || !a.EntryPermitNumber.StartsWith("1C-")))
            .Select(a => a.Id).ToListAsync(ct);
        foreach (var id in permits)
        {
            await Process(id.ToString(), async () =>
            {
                var a = await db.EmptyWagonArrivals.Include(a => a.Units).Include(a => a.CreatedBy).SingleAsync(a => a.Id == id, ct);
                var no = string.IsNullOrWhiteSpace(a.EntryPermitNumber) ? a.ArrivalNumber : a.EntryPermitNumber;
                var rows = a.Units.OrderBy(u => u.WagonNumber).Select((u, i) => new EntryPermitPdfWagonRow(i + 1,
                    u.WagonNumber, u.CisternNumber, Name(u.WagonType, "Vagon-sisterna"), Name(u.ProductType, a.ProductType), u.Status)).ToList();
                var model = new EntryPermitPdfModel(no, a.ArrivalNumber, a.ProductType, a.WagonCount, a.CreatedAt,
                    Name(a.CreatedBy?.FullName), a.EntryPermitQrVerificationUrl, a.EntryPermitQrGlobalId, rows,
                    a.EntryPermitShiftApprovedByName, a.EntryPermitShiftApprovedAt, true,
                    a.EntryPermitPermitApprovedByName, a.EntryPermitPermitApprovedAt,
                    a.EntryPermitSecurityApprovedByName, a.EntryPermitSecurityApprovedAt,
                    a.EntryPermitSecurityApprovedAt, true);
                if (a.EntryPermitQrFinalFileHash == Hash(model)) return false;
                var request = new QrLinkRegisterRequest(no, "Kirish xizmat xati", $"Kirish xizmat xati № {no}", OwnerName: Name(a.CreatedBy?.FullName));
                var identity = await ReserveAsync(request, ct);
                model = model with { QrGlobalId = identity.GlobalId, QrVerificationUrl = identity.VerificationUrl };
                var result = await UploadAsync(request, identity, pdf.GenerateEntryPermitPdf(model), $"XizmatXati_{no}.pdf", ct);
                a.EntryPermitQrGlobalId = result.GlobalId; a.EntryPermitQrVerificationUrl = result.VerificationUrl;
                a.EntryPermitQrCodeBase64 = result.QrCodeBase64; a.EntryPermitQrRegisteredAt = result.RegisteredAt;
                a.EntryPermitQrFinalFileHash = Hash(model);
                await db.SaveChangesAsync(ct);
                return true;
            });
            db.ChangeTracker.Clear();
        }

        var defects = await db.EmptyWagonUnits.AsNoTracking().Where(u => u.DefectActNumber != null && u.DefectActNumber != ""
            && !u.DefectActNumber.StartsWith("1C-") && !u.DefectActNumber.StartsWith("IR-1C-") && u.DefectActUploadedAt != null)
            .Select(u => u.Id).ToListAsync(ct);
        foreach (var id in defects)
        {
            await Process(id.ToString(), async () =>
            {
                var u = await db.EmptyWagonUnits.SingleAsync(u => u.Id == id, ct);
                var a = await db.EmptyWagonArrivals.AsNoTracking().Include(a => a.CreatedBy).SingleOrDefaultAsync(a => a.Id == u.EmptyWagonArrivalId, ct);
                if (a?.ArrivalNumber.StartsWith("1C-") == true) return false;
                var dispName = Name(u.DefectActUploadedByName);
                var handoverName = !string.IsNullOrWhiteSpace(a?.CreatedBy?.FullName) ? a.CreatedBy.FullName : dispName;
                var scaleName = !string.IsNullOrWhiteSpace(u.SealConfirmedByScaleName)
                    ? u.SealConfirmedByScaleName
                    : (u.WagonType == "platform" ? dispName : handoverName);

                var model = new DefectActPdfModel(u.DefectActNumber, u.DefectActType, u.WagonNumber, u.CisternNumber,
                    u.WagonType, u.ProductType ?? a?.ProductType, a?.ArrivalNumber, u.LoadingComment,
                    u.DefectActUploadedAt!.Value, dispName, u.DefectActQrVerificationUrl,
                    u.DefectActQrGlobalId,
                    DispatcherName: dispName,
                    DispatcherAt: u.DefectActUploadedAt,
                    HandoverName: handoverName,
                    HandoverAt: a?.CreatedAt ?? u.DefectActUploadedAt,
                    ScaleName: scaleName,
                    ScaleAt: u.TareWeighedAt ?? u.GrossWeighedAt ?? u.DefectActUploadedAt,
                    ApprovedAt: u.DefectActUploadedAt);
                if (u.DefectActQrFinalFileHash == Hash(model)) return false;
                var request = new QrLinkRegisterRequest(u.DefectActNumber!, "Dalolatnoma",
                    $"Nomuvofiqlik dalolatnomasi № {u.DefectActNumber} ({u.WagonNumber})", Status: "Approved", OwnerName: Name(u.DefectActUploadedByName));
                var identity = await ReserveAsync(request, ct);
                model = model with { QrGlobalId = identity.GlobalId, QrVerificationUrl = identity.VerificationUrl };
                var bytes = pdf.GenerateDefectActPdf(model);
                var fileName = $"Dalolatnoma_{u.DefectActNumber}_{u.WagonNumber}.pdf";
                var result = await UploadAsync(request, identity, bytes, fileName, ct);
                using var stream = new MemoryStream(bytes);
                u.DefectActObjectKey = await storage.UploadAsync(stream, fileName, "application/pdf");
                u.DefectActFileName = fileName; u.DefectActContentType = "application/pdf";
                u.DefectActQrGlobalId = result.GlobalId; u.DefectActQrVerificationUrl = result.VerificationUrl;
                u.DefectActQrCodeBase64 = result.QrCodeBase64; u.DefectActQrRegisteredAt = result.RegisteredAt;
                u.DefectActQrFinalFileHash = Hash(model);
                await db.SaveChangesAsync(ct);
                return true;
            });
            db.ChangeTracker.Clear();
        }
        return new(uploaded, unchanged, failed);
    }

    private async Task<QrLinkRegistrationResult> ReserveAsync(QrLinkRegisterRequest request, CancellationToken ct)
    {
        var result = await qr.RegisterDocumentAsync(request, cancellationToken: ct);
        if (string.IsNullOrWhiteSpace(result.GlobalId)) throw new IOException("QrLink metadata registration failed.");
        return result;
    }

    private async Task<QrLinkRegistrationResult> UploadAsync(QrLinkRegisterRequest request,
        QrLinkRegistrationResult identity, byte[] bytes, string fileName, CancellationToken ct)
    {
        var result = await qr.RegisterDocumentAsync(request, bytes, fileName, ct);
        if (string.IsNullOrWhiteSpace(result.GlobalId) || result.GlobalId != identity.GlobalId)
            throw new IOException("QrLink final upload failed or changed the document identity.");
        return result;
    }
}
