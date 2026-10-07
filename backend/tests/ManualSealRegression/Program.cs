using System.Reflection;
using System.Security.Claims;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Integrations;
using ETransport.Modules.Accounting.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
var arrival = new EmptyWagonArrival { ArrivalDate = new DateTime(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc), Stage = "GrossWeighed" };
var first = new EmptyWagonUnit { WagonNumber = "54633284", Status = "GrossWeighed", TareWeight = "22", GrossWeight = "70", Arrival = arrival };
var second = new EmptyWagonUnit { WagonNumber = "54633285", Status = "AwaitingTare", Arrival = arrival };
arrival.Units.AddRange([first, second]); db.Add(arrival); await db.SaveChangesAsync();
var source = new FakeOneC();
var controller = new OneCIntegrationsController(db, source, NullLogger<OneCIntegrationsController>.Instance) {
 ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "Regression Admin")], "test")) } }
};
var result = await controller.SetManualSeal(new("54633284", "  BEZ PLOMBA  ", arrival.Id), default);
Check(result.Result is OkObjectResult && first.SealNumber == "BEZ PLOMBA" && first.IsManualSeal, "Manual text not saved");
Check(first.Status == "Sealed" && first.SealConfirmedByScaleAt != null && first.SealConfirmedBySecurityAt != null && first.SealEnteredToUngAt != null, "Waybill seal confirmations missing");
Check((await controller.SetManualSeal(new("54633285", "BEZ PLOMBA", arrival.Id), default)).Result is OkObjectResult, "Repeated text rejected");
Check(second.Status == "AwaitingTare", "Early stage incorrectly advanced");
Check((await controller.SetManualSeal(new("54633284", "wrong", Guid.NewGuid()), default)).Result is NotFoundObjectResult && first.SealNumber == "BEZ PLOMBA", "Wrong arrival fell back");
Check((await controller.SetManualSeal(new("54633284", "  ", arrival.Id), default)).Result is BadRequestObjectResult, "Blank accepted");
Check((await controller.SetManualSeal(new("54633284", "replacement", arrival.Id), default)).Result is ConflictObjectResult && first.SealNumber == "BEZ PLOMBA", "Existing seal overwritten");
var raw = new OneCWeighingRaw("2026-09-22 10:00:00", "2026-09-22 11:00:00", "54633284", "", "OLD-1C", "", "", 22000, 70000, 48000, "", "", "", "", "railway");
var build = typeof(OneCIntegrationsController).GetMethod("BuildResult", BindingFlags.NonPublic | BindingFlags.Static)!;
OneCWeighingsResultDto Map(OneCWeighingRaw item) => (OneCWeighingsResultDto)build.Invoke(null, new object?[] { new[] { item }, "20260922", "20260922", null, false, new[] { first, second } })!;
Check(Map(raw).Items[0] is { StampNumber: "BEZ PLOMBA", IsManualSeal: true }, "Refresh lost override");
Check(Map(raw with { Channel = "auto" }).Items[0].StampNumber == "OLD-1C", "Auto enriched incorrectly");
Check(Map(raw with { DatetimeIn = "2026-07-01", DatetimeOut = "2026-07-01" }).Items[0].StampNumber == "OLD-1C", "Old trip inherited seal");
var sync = new OneCEmptyWagonSyncService(db, null!, null!, NullLogger<OneCEmptyWagonSyncService>.Instance);
await sync.ApplySealedRailwayAsync([raw]);
Check(first.SealNumber == "BEZ PLOMBA", "1C sync overwrote manual seal");
Console.WriteLine("PASS: arbitrary text, duplicate text, confirmations, early status, wrong arrival, blank input, reload enrichment, auto/history isolation, sync preservation.");

var third = new EmptyWagonUnit { WagonNumber = "54633286", Arrival = arrival };
db.Add(third); await db.SaveChangesAsync();
source.Items = [raw with { WagonNumber = "54633286" }];
Check((await controller.SetManualSeal(new("54633286", "replacement", arrival.Id), default)).Result is ConflictObjectResult && third.SealNumber == "", "Unsynced 1C seal overwritten");
source.Error = "offline";
Check((await controller.SetManualSeal(new("54633286", "replacement", arrival.Id), default)).Result is ObjectResult { StatusCode: 502 }, "1C outage allowed unchecked save");
Console.WriteLine("PASS: existing local/manual seals and unsynced 1C seals cannot be edited; 1C outage fails closed.");

// Takror kelgan vagon: oldingi tashrifning 1C plombasi yangi, plombasiz tashrifni to'smasligi kerak.
var oldArrival = new EmptyWagonArrival { ArrivalNumber = "P-OLD", ArrivalDate = new DateTime(2026, 9, 18, 0, 0, 0, DateTimeKind.Utc), Stage = "Exited" };
oldArrival.Units.Add(new EmptyWagonUnit { WagonNumber = "54633290", Status = "Sealed", SealNumber = "OLD-1C-SEAL", Arrival = oldArrival });
var fresh = new EmptyWagonUnit { WagonNumber = "54633290", Status = "GrossWeighed", TareWeight = "22", GrossWeight = "70", Arrival = arrival };
arrival.Units.Add(fresh);
db.Add(oldArrival); db.Add(fresh); await db.SaveChangesAsync();
source.Error = null;
source.Items = [
    raw with { WagonNumber = "54633290", StampNumber = "OLD-1C-SEAL", DatetimeIn = "2026-09-18 08:00:00", DatetimeOut = "2026-09-18 10:00:00" },
    raw with { WagonNumber = "54633290", StampNumber = "", DatetimeIn = "2026-09-22 08:00:00", DatetimeOut = "2026-09-22 10:00:00" },
];
Check((await controller.SetManualSeal(new("54633290", "PLOMBASIZ", arrival.Id), default)).Result is OkObjectResult && fresh.SealNumber == "PLOMBASIZ",
    "Oldingi tashrif plombasi yangi tashrifni to'sib qo'ydi");
source.Items = [raw with { WagonNumber = "54633290", StampNumber = "THIS-VISIT", DatetimeIn = "2026-09-22 08:00:00", DatetimeOut = "2026-09-22 10:00:00" }];
var untouched = new EmptyWagonUnit { WagonNumber = "54633291", Status = "GrossWeighed", TareWeight = "22", GrossWeight = "70", Arrival = arrival };
arrival.Units.Add(untouched); db.Add(untouched); await db.SaveChangesAsync();
source.Items = [raw with { WagonNumber = "54633291", StampNumber = "THIS-VISIT", DatetimeIn = "2026-09-22 08:00:00", DatetimeOut = "2026-09-22 10:00:00" }];
Check((await controller.SetManualSeal(new("54633291", "PLOMBASIZ", arrival.Id), default)).Result is ConflictObjectResult && untouched.SealNumber == "",
    "Shu tashrifdagi 1C plombasi ustiga qo'lda yozildi");
Console.WriteLine("PASS: qayta kelgan vagonda faqat shu tashrifning 1C plombasi tekshiriladi.");

sealed class FakeOneC : IOneCEmptyWagonSyncService
{
    public IReadOnlyList<OneCWeighingRaw> Items = [];
    public string? Error;
    public Task<(IReadOnlyList<OneCWeighingRaw> Items, string? Error)> FetchAsync(string date1, string date2, CancellationToken cancellationToken = default) => Task.FromResult((Items, Error));
    public Task<OneCEmptyWagonSyncResult> SyncSealedRailwayAsync(string? date1 = null, string? date2 = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<OneCEmptyWagonSyncResult> ApplySealedRailwayAsync(IReadOnlyList<OneCWeighingRaw> items, CancellationToken cancellationToken = default) => throw new NotImplementedException();
}
