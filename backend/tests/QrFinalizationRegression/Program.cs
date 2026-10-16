using System.Net;
using System.Text;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Pdf;
using ETransport.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
static void Check(bool value, string message) { if (!value) throw new Exception(message); }
var handler = new CaptureHandler();
var service = new QrLinkService(new Factory(handler), Options.Create(new QrLinkOptions {
    Enabled = true, BaseUrl = "http://test/api/documents/register", SourceSystem = "E-TRANSPORT", ApiKey = "test"
}), NullLogger<QrLinkService>.Instance);
var reply = await service.RegisterDocumentAsync(new("WB-TEST", "Yuk xati", "Test", MetadataJson: "{\"a\":1}", WorkflowJson: "{\"name\":\"test\"}"), Encoding.UTF8.GetBytes("%PDF-test"), "test.pdf");
Check(reply.GlobalId == "GLOBAL-1", "409 did not overwrite");
Check(handler.Paths.SequenceEqual(new[] {"/api/documents/register", "/api/documents/update"}), "Wrong overwrite endpoint");
Check(handler.Bodies.All(b => b.Contains("WB-TEST") && !b.Contains("WB-TEST_") && b.Contains("%PDF-test") && b.Contains("metadataJson") && b.Contains("workflow")), "Identity or multipart payload lost");
Console.WriteLine("PASS: 409 preserves identity and all multipart fields");

await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
var now = DateTime.UtcNow;
LoadingRegistry Registry(string number, bool approved) => new() {
    RegistryNumber = number, PreparedByName = "Economist", PreparedAt = now,
    IsApprovedByPermit = approved, IsApprovedBySecurity = approved,
    PermitApprovedAt = approved ? now : null, SecurityApprovedAt = approved ? now : null,
    PermitApprovedByName = "Permit Person", SecurityApprovedByName = "Security Person",
    ShiftSupervisorApprovedByName = " ", EconomistApprovedByName = "",
    EmptyWagonArrival = new() { ArrivalNumber = "ARR", CreatedBy = new User(), LoadingCompletedByName = " ", CreatedAt = now }
};
var ready = Registry("WB-READY", true); var pending = Registry("WB-DRAFT", false); var imported = Registry("YX-1C-IGNORE", true);
db.AddRange(ready, pending, imported); await db.SaveChangesAsync();
var fake = new FakeQr(); var pdf = new FakePdf();
var publisher = new QrFinalizationService(db, fake, pdf, new FakeStorage(), LoggerFactory.Create(b => b.AddConsole()).CreateLogger<QrFinalizationService>());
fake.FailFile = true;
var first = await publisher.SyncAsync();
Check(first.Failed == 1 && (await db.LoadingRegistries.FindAsync(ready.Id))!.QrFinalFileHash == "", "Failed upload marked complete");
fake.FailFile = false;
var second = await publisher.SyncAsync();
Check(second.Uploaded == 1 && second.Failed == 0, "Retry did not complete");
Check(fake.Requests.All(r => r == "WB-READY"), "Draft or 1C document uploaded");
Check(pdf.Last!.Signers!.All(s => !string.IsNullOrWhiteSpace(s.Name) && s.At.HasValue && s.Status != "Kutilmoqda"), "Blank signer fallback");
Check(pdf.Last.Signers![0].Name == "Javliyev Nematilla Tilovovich" && pdf.Last.Signers[1].Name == "Kamolov Xikmat Abdurazzoq og'li" && pdf.Last.Signers[2].Name == "Economist", "Incorrect name fallback");
Check(pdf.Last.QrGlobalId == "GLOBAL-1" && pdf.Last.QrVerificationUrl!.EndsWith("GLOBAL-1"), "PDF missing central identity");
var calls = fake.Requests.Count;
Check((await publisher.SyncAsync()).Uploaded == 0 && fake.Requests.Count == calls, "Idempotent replay made network calls");
var updated = await db.LoadingRegistries.FindAsync(ready.Id); updated!.SecurityApprovedByName = "Corrected Person"; await db.SaveChangesAsync();
Check((await publisher.SyncAsync()).Uploaded == 1, "Changed document not refreshed");
var invalid = Registry("WB-MISSING", true); invalid.SecurityApprovedByName = ""; db.Add(invalid); await db.SaveChangesAsync();
Check((await publisher.SyncAsync()).Failed == 1 && !fake.Requests.Contains("WB-MISSING"), "Incomplete signer uploaded as final");
Console.WriteLine("PASS: final-only selection, fallback names, central QR, retry, fingerprint persistence, changed document refresh, incomplete signer rejection");

class CaptureHandler : HttpMessageHandler {
 public List<string> Paths = []; public List<string> Bodies = [];
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct) {
 Paths.Add(r.RequestUri!.AbsolutePath); Bodies.Add(await r.Content!.ReadAsStringAsync(ct));
 return new(Paths.Count == 1 ? HttpStatusCode.Conflict : HttpStatusCode.OK) { Content = new StringContent("{\"data\":{\"globalId\":\"GLOBAL-1\"}}") };
 }
}
class Factory(HttpMessageHandler handler) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(handler, false); }
class FakeQr : IQrLinkService {
 public bool FailFile; public List<string> Requests = [];
 public Task<QrLinkRegistrationResult> RegisterDocumentAsync(QrLinkRegisterRequest request, byte[]? fileBytes = null, string? fileName = null, CancellationToken cancellationToken = default) {
 Requests.Add(request.SourceDocumentId); var id = FailFile && fileBytes != null ? "" : "GLOBAL-1";
 return Task.FromResult(new QrLinkRegistrationResult(id, "https://qrlink.sgcc.uz/verify/" + id, "qr", DateTime.UtcNow));
 }
}
class FakePdf : IDocumentPdfGenerator {
 public YukXatiPdfModel? Last;
 public byte[] GenerateYukXatiPdf(YukXatiPdfModel m, YukXatiPartInfo? part = null, bool numberedParts = true) { Last = m; return [1]; }
 public byte[] GenerateDefectActPdf(DefectActPdfModel m) => [1];
 public byte[] GenerateEntryPermitPdf(EntryPermitPdfModel m) => [1];
 public byte[] GenerateMonthlyOrderPdf(MonthlyOrderPdfModel m) => [1];
}
class FakeStorage : IFileStorageService {
 public Task<string> UploadAsync(Stream s, string n, string t) => Task.FromResult(n);
 public Task<Stream?> DownloadAsync(string key) => Task.FromResult<Stream?>(null);
 public Task DeleteAsync(string key) => Task.CompletedTask;
}
