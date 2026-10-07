using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
foreach(var stage in new[]{"RailwayInspected","KengsoyInspection","SecurityInspection"}) {
 var pending=new EmptyWagonArrival {Stage=stage,Units=new List<EmptyWagonUnit>{new(){Status="SealPending",SealNumber="old-seal",GrossWeight="71.64",TareWeight="21.32"}}};
 EmptyWagonUnitSync.DerivePartyStage(pending);
 if(pending.Stage!=stage)throw new Exception("Entry skipped: "+stage);
}
var displaced=new EmptyWagonArrival {Stage="SealInstallation",EntryPermitShiftApprovedAt=DateTime.UtcNow,Units=new List<EmptyWagonUnit>{new(){Status="SealPending",SealNumber="old-seal",GrossWeight="71.64"},new(){Status="AwaitingTare"}}};
EmptyWagonUnitSync.DerivePartyStage(displaced);
if(displaced.Stage!="SecurityInspection" || displaced.Units.First().SealNumber!="old-seal")throw new Exception("Recovery failed");
displaced.EntryPermitPermitApprovedAt=DateTime.UtcNow;
EmptyWagonUnitSync.DerivePartyStage(displaced);
if(displaced.Stage!="SecurityInspection")throw new Exception("Security skipped");
foreach(var stage in new[]{"RegistryPrepared","PermitAndSecurityApproved","DocumentsIssued","Exited","Cancelled"}) {
 displaced.Stage=stage;EmptyWagonUnitSync.DerivePartyStage(displaced);
 if(displaced.Stage!=stage)throw new Exception("Final document reopened");
}
displaced.Stage="SealInstallation";displaced.EntryPermitSecurityApprovedAt=DateTime.UtcNow;
EmptyWagonUnitSync.DerivePartyStage(displaced);
if(displaced.Stage!="SealInstallation")throw new Exception("Approved entry rolled back");
Console.WriteLine("PASS: entry gates retained; displaced party restored; measurements retained; final documents untouched; approved entry preserved.");

foreach (var (tare, gross, valid) in new[] { ("", "", false), ("37.1", "", false), ("37.1", "37.1", false), ("37.1", "30", false), ("0", "70", false), ("37,1", "70,2", true) })
{
    if (EmptyWagonUnitSync.HasMeasuredNet(new EmptyWagonUnit { TareWeight = tare, GrossWeight = gross }) != valid)
        throw new Exception("Invalid gross review eligibility: " + tare + "/" + gross);
}
Console.WriteLine("PASS: missing, zero, equal, reversed and valid decimal weights checked.");
