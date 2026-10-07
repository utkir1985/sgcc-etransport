// Takror kelgan vagon ssenariylari: yuk xatini qayta saqlash, o'chirish va 1C moslashtirish.
// 22.09.2026 auditidagi 1-, 2-, 3- va 6-kamchiliklar uchun regressiya.
using ETransport.Modules.Dispatching.Controllers;
using System.Security.Claims;
using System.Text.Json;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Core.Interfaces;
using ETransport.Infrastructure.Audit;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Infrastructure.Pdf;
using ETransport.Infrastructure.Storage;
using ETransport.Modules.Documents.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

static void Check(bool condition, string message) { if (!condition) throw new Exception("FAIL: " + message); }

const string Wagon = "54633284";

static DocumentsController NewController(AppDbContext db) => new(
    db, new FakeStorage(), new FakeQr(), new FakePdf(), null!, new FakeNumbering(), new FakeAudit())
{
    ControllerContext = new ControllerContext
    {
        HttpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.Name, "Regression Economist"), new Claim(ClaimTypes.Role, "Economist"),
                 new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString())], "test")),
        },
    },
};

// --- Umumiy ssenariy: vagon ikki marta kelgan, ikkinchi tashrifga yuk xati tuzilgan ---
static async Task<(AppDbContext Db, MonthlyOrder Order, MonthlyOrderLine Line, LoadingRegistry Registry,
                   EmptyWagonArrival Old, EmptyWagonArrival Current)> SeedAsync()
{
    var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    var line = new MonthlyOrderLine
    {
        Contractor = "Kontragent",
        DestinationStation = "Kengsoy",
        WagonCount = 10,
        TonCount = 500,
        FulfilledWagonCount = 3,
        FulfilledNetWeight = 150,
    };
    var order = new MonthlyOrder { OrderNumber = "BUY-1", ContractNumber = "SH-1", Status = OrderStatus.Active };
    order.Lines.Add(line);

    // Eski, chiqib ketgan tashrif — netto 40 t
    var old = new EmptyWagonArrival { ArrivalNumber = "P-100", ArrivalDate = new DateTime(2026, 9, 20, 0, 0, 0, DateTimeKind.Utc), Stage = "Exited" };
    old.Units.Add(new EmptyWagonUnit
    {
        WagonNumber = Wagon, Status = "Sealed", SealNumber = "OLD-SEAL",
        TareWeight = "20", GrossWeight = "60", Arrival = old,
        ScaleExitedAt = new DateTime(2026, 9, 20, 12, 0, 0, DateTimeKind.Utc),
    });

    // Joriy tashrif — netto 50 t
    var current = new EmptyWagonArrival { ArrivalNumber = "P-101", ArrivalDate = new DateTime(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc), Stage = "Sealed" };
    current.Units.Add(new EmptyWagonUnit
    {
        WagonNumber = Wagon, Status = "Sealed", SealNumber = "NEW-SEAL",
        TareWeight = "20", GrossWeight = "70", Arrival = current,
    });

    var route = new LoadingRegistryWagonRouteDto(
        Wagon, line.Id, line.Contractor, line.DestinationStation,
        false, "", "", order.Id, order.OrderNumber, "", current.Id, current.ArrivalNumber, 50);

    var registry = new LoadingRegistry
    {
        EmptyWagonArrivalId = current.Id,
        RegistryNumber = "YX-1",
        PreparedAt = new DateTime(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc),
        MonthlyOrderId = order.Id,
        MonthlyOrderLineId = line.Id,
        OrderNumber = order.OrderNumber,
        ContractorName = line.Contractor,
        DestinationStation = line.DestinationStation,
        WagonRoutesJson = JsonSerializer.Serialize(new[] { route }),
        OrderDeductedWagons = 1,
        OrderDeductedNetWeight = 50,
    };

    db.AddRange(order, old, current, registry);
    await db.SaveChangesAsync();
    return (db, order, line, registry, old, current);
}

// === 1. Qayta saqlashda buyurtma tonnasi o'zgarmasligi ===
{
    var (db, order, line, registry, _, current) = await SeedAsync();
    var controller = NewController(db);
    var result = await controller.UpdateLoadingRegistry(registry.Id, new UpdateLoadingRegistryRequest(
        "YX-1", "Qayta saqlash sinovi",
        [new CreateLoadingRegistryWagonRouteRequest(Wagon, line.Id, false, order.Id, current.Id)]));

    Check(result.Result is OkObjectResult, "Qayta saqlash rad etildi");
    Check(line.FulfilledNetWeight == 150, $"Tonna o‘zgardi: 150 kutilgan, {line.FulfilledNetWeight} chiqdi");
    Check(line.FulfilledWagonCount == 3, $"Vagon soni o‘zgardi: 3 kutilgan, {line.FulfilledWagonCount} chiqdi");
    await db.DisposeAsync();
    Console.WriteLine("PASS: yuk xatini qayta saqlash buyurtma hisobini o‘zgartirmaydi (eski tashrif nettosi ayrilmaydi).");
}

// === 2. Noto'g'ri partiya ko'rsatilsa, boshqa tashrifga o'tib ketmaslik ===
{
    var (db, order, line, registry, _, _) = await SeedAsync();
    var controller = NewController(db);
    var result = await controller.UpdateLoadingRegistry(registry.Id, new UpdateLoadingRegistryRequest(
        "YX-1", "Noto‘g‘ri partiya sinovi",
        [new CreateLoadingRegistryWagonRouteRequest(Wagon, line.Id, false, order.Id, Guid.NewGuid())]));

    Check(result.Result is BadRequestObjectResult, "Mavjud bo‘lmagan partiya qabul qilindi");
    await db.DisposeAsync();
    Console.WriteLine("PASS: mavjud bo‘lmagan kirish partiyasi bilan tahrirlash rad etiladi.");
}

// === 3. O'chirish: arxivlash xatosiz, qaytarish faqat shu tashrif bo'yicha ===
{
    var (db, _, line, registry, _, _) = await SeedAsync();
    var controller = NewController(db);
    var result = await controller.DeleteLoadingRegistry(registry.Id);

    Check(result.Result is OkObjectResult, "O‘chirish muvaffaqiyatsiz");
    Check(line.FulfilledNetWeight == 100, $"O‘chirishda tonna noto‘g‘ri qaytdi: 100 kutilgan, {line.FulfilledNetWeight} chiqdi");
    Check(line.FulfilledWagonCount == 2, $"O‘chirishda vagon soni noto‘g‘ri: 2 kutilgan, {line.FulfilledWagonCount} chiqdi");

    var trash = await db.RecycleBinItems.FirstOrDefaultAsync(x => x.EntityType == "LoadingRegistry");
    Check(trash is not null && !string.IsNullOrWhiteSpace(trash.PayloadJson), "Korzinaga yozilmadi");
    var restored = JsonSerializer.Deserialize<LoadingRegistry>(trash!.PayloadJson);
    Check(restored is not null && restored.RegistryNumber == "YX-1", "Arxiv nusxasi o‘qilmadi");
    Check(restored!.EmptyWagonArrival is null, "Arxivga bog‘langan partiya obyekti tushib qolgan (tiklashda ikkilanadi)");
    await db.DisposeAsync();
    Console.WriteLine("PASS: yuk xatini o‘chirish arxiv xatosisiz ishlaydi va faqat o‘z tashrifi tonnasini qaytaradi.");
}

// === 4. 1C: bitta tortish faqat bitta tashrifga tushadi, chiqqan tashrif qayta yozilmaydi ===
{
    var (db, _, _, _, old, current) = await SeedAsync();
    var oldUnit = old.Units[0];
    var currentUnit = current.Units[0];

    var sync = new OneCEmptyWagonSyncService(db, null!, null!, NullLogger<OneCEmptyWagonSyncService>.Instance);
    var weighing = new OneCWeighingRaw(
        "2026-09-22 08:00:00", "2026-09-22 10:00:00", Wagon, "", "1C-SEAL", "", "",
        20000, 75000, 55000, "", "", "", "", "railway");

    await sync.ApplySealedRailwayAsync([weighing]);

    Check(oldUnit.SealNumber == "OLD-SEAL", $"Chiqib ketgan tashrif plombasi o‘zgardi: {oldUnit.SealNumber}");
    Check(oldUnit.GrossWeight == "60", $"Chiqib ketgan tashrif bruttosi o‘zgardi: {oldUnit.GrossWeight}");
    Check(currentUnit.SealNumber == "1C-SEAL", $"Joriy tashrifga 1C plombasi tushmadi: {currentUnit.SealNumber}");
    await db.DisposeAsync();
    Console.WriteLine("PASS: 1C tortishi faqat joriy tashrifga yoziladi; chiqib ketgan tashrif tegilmaydi.");
}

// New workflow: legacy documents are exempt; exit and both registrations are required.
foreach (var legacy in new[] { true, false })
foreach (var exited in new[] { true, false })
foreach (var oneC in new[] { true, false })
foreach (var enakl in new[] { true, false })
{
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
        .Options);
    var registry = new LoadingRegistry {
        PreparedAt = legacy ? new DateTime(2026, 9, 29, 8, 51, 4, DateTimeKind.Utc)
            : new DateTime(2026, 9, 29, 8, 51, 5, DateTimeKind.Utc),
        RegistryNumber = "SEQUENCE-TEST",
        EmptyWagonArrival = new EmptyWagonArrival(),
        ExitedToKengsoyAt = exited ? DateTime.UtcNow : null,
        IsSentToOneC = oneC, IsSentToENakl = enakl,
    };
    db.LoadingRegistries.Add(registry);
    await db.SaveChangesAsync();
    var result = await NewController(db).CreateLoadingRegistry(new(Guid.NewGuid(), "NEXT", null, null));
    var blocked = !legacy && !(exited && oneC && enakl);
    Check(blocked ? result.Result is ConflictObjectResult : result.Result is NotFoundObjectResult,
        $"Sequence legacy={legacy}, exit={exited}, 1C={oneC}, E-nakl={enakl}");
    if (!legacy) {
        Check((await NewController(db).ApprovePermit(registry.Id, new(true))).Result is ForbidResult,
            "Economist must not approve permit for new documents");
        Check((await NewController(db).ApproveSecurity(registry.Id, new(true))).Result is ForbidResult,
            "Economist must not approve security for new documents");
    }
}
Console.WriteLine("PASS: legacy exemption, all completion combinations, new document role restrictions.");

// All post-exit mutation paths must reject requests, including administrator requests.
foreach (var exited in new[] { false, true })
foreach (var registered in new[] { false, true })
{
    var (db, _, _, registry, _, _) = await SeedAsync();
    await using var disposal = db;
    registry.PreparedAt = new DateTime(2026, 9, 29, 8, 51, 5, DateTimeKind.Utc);
    registry.ExitedToKengsoyAt = exited ? DateTime.UtcNow : null;
    registry.IsSentToOneC = registered;
    registry.IsApprovedByPermit = true;
    registry.IsApprovedBySecurity = true;
    await db.SaveChangesAsync();
    var controller = NewController(db);
    controller.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
        [new Claim(ClaimTypes.Role, "Admin"), new Claim(ClaimTypes.Name, "Test Admin")], "test"));
    var snapshot = JsonSerializer.Serialize(new {
        registry.IsApprovedByPermit, registry.IsApprovedBySecurity, registry.RegistryNumber,
        registry.ExitedToKengsoyAt, registry.IsSentToOneC
    });
    Check((await controller.ApprovePermit(registry.Id, new(false, "Revoke"))).Result is ConflictObjectResult,
        "Permit must not be revoked after security approval");
    if (exited || registered) {
        Check((await controller.ApproveSecurity(registry.Id, new(false, "Revoke"))).Result is ConflictObjectResult, "Security lock");
        Check((await controller.ApproveShift(registry.Id)).Result is ConflictObjectResult, "Shift lock");
        Check((await controller.ApproveEconomistWithPermit(registry.Id, new())).Result is ConflictObjectResult, "Economist permit lock");
        Check((await controller.ApproveEconomistWithSecurity(registry.Id, new())).Result is ConflictObjectResult, "Economist security lock");
        Check((await controller.HandoverToMachinist(registry.Id, new(null))).Result is ConflictObjectResult, "Handover lock");
        Check((await controller.UpdateLoadingRegistry(registry.Id, new("CHANGED", "Revision"))).Result is ConflictObjectResult, "Edit lock");
        Check((await controller.DeleteLoadingRegistry(registry.Id)).Result is ConflictObjectResult, "Delete lock");
        Check(await db.LoadingRegistries.AnyAsync(r => r.Id == registry.Id), "Locked registry retained");
    }
    Check(snapshot == JsonSerializer.Serialize(new {
        registry.IsApprovedByPermit, registry.IsApprovedBySecurity, registry.RegistryNumber,
        registry.ExitedToKengsoyAt, registry.IsSentToOneC
    }), "Rejected changes must not mutate registry");
}
Console.WriteLine("PASS: exit/registration locks, administrator bypass prevention, permit ordering, no mutation.");

// Entry clearance requires approvals, but never waits for 1C numeric weights.
foreach (var approved in new[] { false, true })
foreach (var bulk in new[] { false, true })
{
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    var arrival = new EmptyWagonArrival {
        Stage = approved ? "ReadyForEstakada" : "SecurityInspection",
        CreatedBy = new User { Username = "entry-test", FullName = "Entry Test" },
        WagonNumbers = Wagon,
        EntryPermitShiftApprovedAt = DateTime.UtcNow,
        EntryPermitPermitApprovedAt = approved ? DateTime.UtcNow : null,
        EntryPermitSecurityApprovedAt = approved ? DateTime.UtcNow : null,
        Units = new List<EmptyWagonUnit> { new() { WagonNumber = Wagon, Status = "AwaitingTare" } }
    };
    db.EmptyWagonArrivals.Add(arrival);
    await db.SaveChangesAsync();
    var controller = new EmptyWagonsController(db, new FakeQr(), new FakePdf(), new FakeNumbering(), new FakeAudit()) {
        ControllerContext = NewController(db).ControllerContext
    };
    if (!approved) {
        Check((await controller.RecordTare(arrival.Id, new("20", null, null))).Result is BadRequestObjectResult,
            "Batch numeric tare must require entry approvals");
        Check((await controller.RecordWagonTare(arrival.Id, Wagon, new("20"))).Result is BadRequestObjectResult,
            "Individual numeric tare must require entry approvals");
    }
    var result = bulk ? await controller.ClearWagonTareCheckBulk(arrival.Id)
        : await controller.ClearWagonTareCheck(arrival.Id, Wagon);
    Check(approved ? result.Result is OkObjectResult : result.Result is BadRequestObjectResult,
        $"Entry clearance approved={approved}, bulk={bulk}");
    var unit = arrival.Units.Single();
    Check(string.IsNullOrWhiteSpace(unit.TareWeight) && string.IsNullOrWhiteSpace(unit.GrossWeight),
        "Entry clearance must not fabricate or require 1C weights");
    Check(unit.TareCheckedAt.HasValue == approved, "Entry clearance timestamp");
    Check(!EmptyWagonUnitSync.HasMeasuredNet(unit), "Entry clearance alone must not enable outgoing waybill");
}
Console.WriteLine("PASS: entry approvals enforced; weightless clearance works; outgoing still awaits measured weights.");

Console.WriteLine("Barcha regressiya sinovlari o‘tdi.");

sealed class FakeStorage : IFileStorageService
{
    public Task<string> UploadAsync(Stream stream, string fileName, string contentType) => Task.FromResult("test/key");
    public Task<Stream?> DownloadAsync(string objectKey) => Task.FromResult<Stream?>(null);
    public Task DeleteAsync(string objectKey) => Task.CompletedTask;
}

sealed class FakeQr : IQrLinkService
{
    public Task<QrLinkRegistrationResult> RegisterDocumentAsync(QrLinkRegisterRequest request, byte[]? fileBytes = null,
        string? fileName = null, CancellationToken cancellationToken = default)
        => Task.FromResult(new QrLinkRegistrationResult("QR-1", "https://example.invalid/verify/QR-1", "", DateTime.UtcNow));
}

sealed class FakePdf : IDocumentPdfGenerator
{
    public byte[] GenerateDefectActPdf(DefectActPdfModel model) => [];
    public byte[] GenerateYukXatiPdf(YukXatiPdfModel model) => [];
    public byte[] GenerateEntryPermitPdf(EntryPermitPdfModel model) => [];
    public byte[] GenerateMonthlyOrderPdf(MonthlyOrderPdfModel model) => [];
}

sealed class FakeNumbering : IDocumentNumberingService
{
    public Task<string> GenerateInboundBatchNumberAsync(CancellationToken ct = default) => Task.FromResult("P-TEST");
    public Task<string> GenerateOutboundBatchNumberAsync(CancellationToken ct = default) => Task.FromResult("CH-TEST");
    public Task<string> GenerateEntryPermitNumberAsync(CancellationToken ct = default) => Task.FromResult("XX-TEST");
    public Task<string> GenerateDefectActNumberAsync(CancellationToken ct = default) => Task.FromResult("DA-TEST");
    public Task<string> GenerateSealDefectActNumberAsync(CancellationToken ct = default) => Task.FromResult("PDA-TEST");
    public Task<string> GenerateWaybillNumberAsync(string? basePartyNumber = null, CancellationToken ct = default) => Task.FromResult("YX-TEST");
    public Task<string> GenerateOrderNumberAsync(string logisticsType, string productType, CancellationToken ct = default) => Task.FromResult("BUY-TEST");
}

sealed class FakeAudit : IAuditService
{
    public Task LogAsync(Guid? userId, string action, string entityType, string entityId, string details, string? category = null, string status = "Success") => Task.CompletedTask;
    public Task LogAsync(string action, string entityType, string entityId, string details, string category = "Operations", string status = "Success", AuditContextInfo? context = null) => Task.CompletedTask;
    public Task LogAuthAsync(string action, string username, string status, string details, Guid? userId = null, string? userFullName = null, string? role = null, string? position = null, string? department = null) => Task.CompletedTask;
}
