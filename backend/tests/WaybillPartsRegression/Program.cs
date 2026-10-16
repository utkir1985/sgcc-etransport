using System.Text.Json;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Pdf;
using ETransport.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
static void Check(bool value, string message) { if (!value) throw new Exception(message); }

const string Lpg = "Suyultirilgan gaz", Cond = "Tabiiy gaz kondensati";
const string Jiz = "«Hududgaz Jizzax» gaz ta'minoti filiali — Jomboy", And = "«Hududgaz Andijon» gaz ta'minoti filiali — Axtachi";
const string Sir = "«Hududgaz Sirdaryo» gaz ta'minoti filiali — Jomboy", Bux = "Buxoro neftni qayta ishlash zavodi — Qorovulbozor";
var data = new (string No, decimal T, decimal B, string Seal, string P, string C, string R)[] {
    ("50512466",37160,69340,"4947992-25, 4947993-25",Lpg,"1442/024",Jiz), ("50882075",37000,69360,"4947986-25, 4947987-25",Lpg,"1442/024",And),
    ("57895187",36420,67440,"4947988-25, 4947989-25",Lpg,"1442/024",Jiz), ("58156324",34620,66340,"4948004-25, 4948005-25",Lpg,"1442/024",Sir),
    ("58166190",34540,66780,"4947994-25, 4947995-25",Lpg,"1442/024",Jiz), ("58201021",33940,65320,"4948000-25, 4948001-25",Lpg,"1442/024",Sir),
    ("58201963",33960,65100,"4947998-25, 4947999-25",Lpg,"1442/024",Sir), ("73035412",25040,75120,"4947984-25",Cond,"8795332",Bux),
    ("73929960",21940,72720,"4947983-25",Cond,"8795332",Bux), ("73996605",23080,82280,"4947985-25",Cond,"8795332",Bux),
    ("74124652",21700,72440,"4947982-25",Cond,"8795332",Bux), ("76676352",33900,65880,"4948006-25, 4948007-25",Lpg,"1442/024",Sir),
    ("76680735",33480,65980,"4947996-25, 4947997-25",Lpg,"1442/024",Jiz), ("77906295",36080,67900,"4947990-25, 4947991-25",Lpg,"1442/024",Jiz),
    ("78152097",37360,69080,"4948002-25, 4948003-25",Lpg,"1442/024",Sir) };
var rows = data.Select((d, i) => new YukXatiPdfWagonRow(i + 1, d.No, null, "Vagon-sisterna", d.P, d.T, d.B, d.B - d.T, d.Seal, "Loaded", d.R, false, null, d.C)).ToList();
var at = new DateTime(2026, 10, 15, 17, 45, 0, DateTimeKind.Utc);
var signers = new List<YukXatiPdfSigner> {
    new("warehouse","Tayyor mahsulotlar va xom ashyo sexi","Yuklandi","Uroqov Ziyodulla Ortiqovich",at), new("scale","Tarozi operatori","Tarozida tortildi","Kamolov Hikmat",at),
    new("economist","ICHDX iqtisodchisi","Yuk xati shakllantirildi","Rajabov Botir",at), new("shift_supervisor","PDS (ICHDX) smena boshlig‘i","Tasdiqlandi","Nurullayev Shuxrat",at),
    new("permit","Ruxsatnoma byurosi xodimi","Kelishildi","Sharipov Xudoyberdi",at), new("security","Qo‘riqlash xizmati (NO‘J) xodimi","Kelishildi","Xamraev Aziz",at) };
YukXatiPdfModel Model(List<YukXatiPdfWagonRow> w) => new("WB-1026-030", "LPG-1026-001", "Bir nechta", "", Lpg, w.Count,
    w.Sum(x => x.NettoWeight), at, "Rajabov Botir", "Nurullayev Shuxrat", "Xamraev Aziz", null, null, w,
    w.Sum(x => x.TareWeight), w.Sum(x => x.BruttoWeight), ContractNo: "Bir nechta shartnoma", ExitDate: at, ShiftLeaderName: "Nurullayev Shuxrat", ShiftLeaderAt: at, Signers: signers);

var master = Model(rows);
var groups = YukXatiGrouping.Group(master);
Check(groups.Select(g => g.Number).SequenceEqual(new[] { "WB-1026-030-1", "WB-1026-030-2", "WB-1026-030-3", "WB-1026-030-4" }), "Numbering by first appearance");
Check(groups.Select(g => g.WagonCount).SequenceEqual(new[] { 5, 1, 5, 4 }), "Group sizes");
Check(groups[0].Receiver == Jiz && groups[3].ContractNumber == "8795332", "Group keys");
Check(groups.Sum(g => g.TareKg) == 480220 && groups.Sum(g => g.BruttoKg) == 1041080 && groups.Sum(g => g.NettoKg) == 560860, "Parts reconcile with master");
Check(groups[2].NettoKg == 157940 && groups[3].NettoKg == 210800, "Group totals");
Console.WriteLine("PASS: 15 wagons -> 4 parts, totals reconcile");

// Bitta qabul qiluvchi: qo'shimchasiz raqam, ajratma yo'q
var single = Model(rows.Where(r => r.ContractNumber == "8795332").ToList());
Check(YukXatiGrouping.Group(single).Single().Number == "WB-1026-030" && YukXatiGrouping.Parts(single).Count == 0, "Single group keeps master number");
Console.WriteLine("PASS: single recipient -> no parts");

// Nomuvofiq vagon: alohida bo'lim, ajratmaga kirmaydi
var withDefect = Model(rows.Select((r, i) => i == 1 ? r with { IsDefective = true, ReceiverAndStation = "Nomuvofiqlik aniqlangan · DA-1026-004", DefectActFileName = "DA-1026-004" } : r).ToList());
var dg = YukXatiGrouping.Group(withDefect);
Check(dg.Count(g => !g.IsDefectiveSection) == 3 && dg[^1].IsDefectiveSection && YukXatiGrouping.Parts(withDefect).Count == 3, "Defective wagon excluded from parts");
Console.WriteLine("PASS: defective wagon -> own section, not a part");

// Ajratma modeli: qayta guruhlansa bitta guruh va raqami saqlanadi
var partModel = YukXatiGrouping.PartModel(master, groups[2], null, null);
var pg = YukXatiGrouping.Group(partModel);
Check(pg.Single().Number == "WB-1026-030-3" && partModel.TotalNetto == 157940 && partModel.WagonCount == 5, "Part model");
Console.WriteLine("PASS: part model keeps its number and totals");

var outDir = args.Length > 0 ? args[0] : null;
var gen = new DocumentPdfGenerator();
foreach (var (name, bytes) in new[] {
    ("master", gen.GenerateYukXatiPdf(master)),
    ("part3", gen.GenerateYukXatiPdf(partModel, new YukXatiPartInfo("WB-1026-030", 3, 4))),
    ("single", gen.GenerateYukXatiPdf(single)),
    ("defect", gen.GenerateYukXatiPdf(withDefect)) })
{
    Check(bytes.Length > 1000, $"{name} PDF generated");
    if (outDir != null) File.WriteAllBytes(Path.Combine(outDir, $"{name}.pdf"), bytes);
}
Console.WriteLine("PASS: PDFs generated");

// QR Link: asosiy hujjat + har bir ajratma bir martadan ro'yxatdan o'tadi, takroriy aylanish tarmoqqa chiqmaydi
await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
var sec = new DateTime(2026, 10, 15, 17, 45, 0, DateTimeKind.Utc);
EmptyWagonArrival NewArrival()
{
    var arrival = new EmptyWagonArrival { ArrivalNumber = "ARR", CreatedBy = new User(), LoadingCompletedByName = "Uroqov Ziyodulla", LoadingCompletedAt = sec, CreatedAt = sec };
    foreach (var d in data.Take(3))
        arrival.Units.Add(new EmptyWagonUnit { WagonNumber = d.No, TareWeight = d.T.ToString(), GrossWeight = d.B.ToString(), SealNumber = d.Seal,
            Status = "Loaded", SealConfirmedByScaleName = "Kamolov Hikmat", GrossWeighedAt = sec, ProductType = Lpg });
    return arrival;
}
LoadingRegistry Reg(string number, DateTime securityAt) => new() {
    RegistryNumber = number, PreparedByName = "Rajabov Botir", PreparedAt = securityAt, EmptyWagonArrival = NewArrival(),
    IsApprovedByShiftSupervisor = true, ShiftSupervisorApprovedByName = "Nurullayev Shuxrat", ShiftSupervisorApprovedAt = securityAt,
    IsApprovedByPermit = true, PermitApprovedByName = "Sharipov Xudoyberdi", PermitApprovedAt = securityAt,
    IsApprovedBySecurity = true, SecurityApprovedByName = "Xamraev Aziz", SecurityApprovedAt = securityAt,
    WagonRoutesJson = JsonSerializer.Serialize(data.Take(3).Select(d => new LoadingRegistryWagonRouteDto(d.No, Guid.Empty,
        d.R.Split(" — ")[0], d.R.Split(" — ")[1], ContractNumber: d.C, ProductType: d.P)).ToList()) };
var reg = Reg("WB-1026-030", sec);
db.Add(reg); await db.SaveChangesAsync();
var fakeQr = new FakeQr();
var service = new QrFinalizationService(db, fakeQr, new DocumentPdfGenerator(), new NoStorage(), NullLogger<QrFinalizationService>.Instance);
var sync1 = await service.SyncAsync();
Check(sync1.Failed == 0 && sync1.Uploaded == 1, $"First sync uploaded={sync1.Uploaded} failed={sync1.Failed}");
var docs = fakeQr.Requests.Distinct().ToList();
Check(docs.SequenceEqual(new[] { "WB-1026-030", "WB-1026-030-1", "WB-1026-030-2" }), "Registered: " + string.Join(",", docs));
var saved = JsonSerializer.Deserialize<List<WaybillPartQrDto>>((await db.LoadingRegistries.AsNoTracking().SingleAsync()).WaybillPartsJson)!;
Check(saved.Count == 2 && saved.All(p => p.QrGlobalId.StartsWith("G-")) && saved[0].Receiver.Contains("Jizzax") && saved[1].Receiver.Contains("Andijon"), "Parts persisted");
var calls = fakeQr.Requests.Count;
var sync2 = await service.SyncAsync();
Check(sync2.Uploaded == 0 && fakeQr.Requests.Count == calls, "Idempotent replay made network calls");
Console.WriteLine("PASS: master + 2 parts registered once, idempotent");

// Bitta ajratma muvaffaqiyatsiz bo'lsa — keyingi aylanishda faqat u qayta urinadi
db.ChangeTracker.Clear();
var r2 = await db.LoadingRegistries.SingleAsync();
r2.WaybillPartsJson = JsonSerializer.Serialize(saved.Take(1).ToList()); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
fakeQr.Requests.Clear();
var sync3 = await service.SyncAsync();
Check(sync3.Uploaded == 1 && fakeQr.Requests.Distinct().SequenceEqual(new[] { "WB-1026-030-2" }), "Only missing part retried");
Console.WriteLine("PASS: missing part retried alone");

// Eski (sentabr) yuk xati: ajratma ham, qayta yuklash ham yo'q
await using var oldDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
oldDb.Add(Reg("WB-0926-050", new DateTime(2026, 9, 20, 10, 0, 0, DateTimeKind.Utc))); await oldDb.SaveChangesAsync(); oldDb.ChangeTracker.Clear();
fakeQr.Requests.Clear();
await new QrFinalizationService(oldDb, fakeQr, new DocumentPdfGenerator(), new NoStorage(), NullLogger<QrFinalizationService>.Instance).SyncAsync();
Check(fakeQr.Requests.Distinct().SequenceEqual(new[] { "WB-0926-050" }), "Old registry got parts: " + string.Join(",", fakeQr.Requests));
Console.WriteLine("PASS: pre-October registry keeps single QR");

// Boshqa kelish partiyasidan qo'shilgan vagon (route.SourceArrivalId) PDF modelida ham chiqadi
await using var crossDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
var other = new EmptyWagonArrival { ArrivalNumber = "ARR-2", CreatedBy = new User(), CreatedAt = sec };
var bux = data[7];
other.Units.Add(new EmptyWagonUnit { WagonNumber = bux.No, TareWeight = bux.T.ToString(), GrossWeight = bux.B.ToString(), SealNumber = bux.Seal, Status = "Loaded", ProductType = Cond });
crossDb.Add(other);
var cross = Reg("WB-1026-031", sec);
var routes = JsonSerializer.Deserialize<List<LoadingRegistryWagonRouteDto>>(cross.WagonRoutesJson)!;
routes.Add(new LoadingRegistryWagonRouteDto(bux.No, Guid.Empty, "Buxoro neftni qayta ishlash zavodi", "Qorovulbozor", ContractNumber: bux.C, ProductType: Cond, SourceArrivalId: other.Id));
cross.WagonRoutesJson = JsonSerializer.Serialize(routes);
crossDb.Add(cross); await crossDb.SaveChangesAsync();
var crossModel = FinalDocumentModels.BuildYukXatiPdfModel(cross, await FinalDocumentModels.LoadRouteUnitsAsync(crossDb, cross));
Check(crossModel.Wagons.Count == 4 && crossModel.Wagons.Any(w => w.WagonNumber == bux.No && w.NettoWeight == 50080), "Cross-arrival wagon missing from PDF model");
Check(FinalDocumentModels.BuildYukXatiPdfModel(cross).Wagons.Count == 3, "Baseline without route units");
Console.WriteLine("PASS: wagon from another arrival included");

// Eski (qo'riqlangan) hujjat: guruhlar raqamsiz, ajratma yo'q
Check(YukXatiGrouping.Group(master, numberedParts: false).All(g => g.Number == "WB-1026-030"), "Legacy groups must not be numbered");
Check(!YukXatiGrouping.IssuesParts(Reg("WB-0926-001", new DateTime(2026, 9, 20, 0, 0, 0, DateTimeKind.Utc))) && YukXatiGrouping.IssuesParts(reg), "Cutoff");
Console.WriteLine("PASS: legacy registries unnumbered");

// Tonnadagi og'irliklar: jami 1000 t dan oshsa ham kg da (1,041,080) chiqadi
var tonRows = rows.Select(r => r with { TareWeight = r.TareWeight / 1000m, BruttoWeight = r.BruttoWeight / 1000m, NettoWeight = r.NettoWeight / 1000m }).ToList();
var tonModel = Model(tonRows) with { TotalTare = 480.22m, TotalBrutto = 1041.08m, TotalNetto = 560.86m };
var tonPdf = gen.GenerateYukXatiPdf(tonModel);
if (outDir != null) File.WriteAllBytes(Path.Combine(outDir, "tons.pdf"), tonPdf);
Check(YukXatiGrouping.Group(tonModel).Sum(g => g.BruttoKg) == 1041080, "Ton rows normalized");
Console.WriteLine("PASS: ton weights normalized");

class FakeQr : IQrLinkService {
    public List<string> Requests = [];
    public Task<QrLinkRegistrationResult> RegisterDocumentAsync(QrLinkRegisterRequest request, byte[]? fileBytes = null, string? fileName = null, CancellationToken cancellationToken = default) {
        Requests.Add(request.SourceDocumentId);
        var id = "G-" + request.SourceDocumentId;
        return Task.FromResult(new QrLinkRegistrationResult(id, "https://qrlink.sgcc.uz/verify/" + id, "qr", DateTime.UtcNow));
    }
}
class NoStorage : IFileStorageService {
    public Task<string> UploadAsync(Stream stream, string fileName, string contentType) => Task.FromResult(fileName);
    public Task<Stream?> DownloadAsync(string objectKey) => Task.FromResult<Stream?>(null);
    public Task DeleteAsync(string objectKey) => Task.CompletedTask;
}
