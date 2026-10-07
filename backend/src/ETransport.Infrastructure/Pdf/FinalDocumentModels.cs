using System.Text.Json;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
namespace ETransport.Infrastructure.Pdf;
public static class FinalDocumentModels
{
    private static string FirstName(params string?[] names) => names.FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "—";
    private static List<LoadingRegistryWagonRouteDto> ParseWagonRoutes(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        return JsonSerializer.Deserialize<List<LoadingRegistryWagonRouteDto>>(json) ?? [];
    }
    public static YukXatiPdfModel BuildYukXatiPdfModel(LoadingRegistry reg)
    {
        var arrival = reg.EmptyWagonArrival;
        var units = (arrival?.Units ?? new List<EmptyWagonUnit>()).OrderBy(u => u.WagonNumber).ToList();
        var unitsByNumber = units.ToDictionary(u => u.WagonNumber, StringComparer.OrdinalIgnoreCase);

        var routeSnapshots = ParseWagonRoutes(reg.WagonRoutesJson);

        var wagonRows = new List<YukXatiPdfWagonRow>();
        int idx = 1;

        if (routeSnapshots.Count > 0)
        {
            foreach (var route in routeSnapshots)
            {
                if (!unitsByNumber.TryGetValue(route.WagonNumber, out var unit)) continue;
                EmptyWagonUnitSync.TryParseWeight(unit.TareWeight, out var tare);
                EmptyWagonUnitSync.TryParseWeight(unit.GrossWeight, out var brutto);
                EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var netto);

                string receiverStation;
                bool isDefective = route.IsDefective || unit.Status == EmptyWagonUnitStatuses.Returned;
                if (isDefective)
                {
                    var actNo = !string.IsNullOrWhiteSpace(unit.DefectActNumber) ? unit.DefectActNumber : (!string.IsNullOrWhiteSpace(route.DefectActFileName) ? route.DefectActFileName : "Dalolatnoma");
                    receiverStation = $"Nomuvofiqlik aniqlangan · {actNo}";
                    tare = 0;
                    brutto = 0;
                    netto = 0;
                }
                else
                {
                    receiverStation = !string.IsNullOrWhiteSpace(route.ContractorName)
                        ? $"{route.ContractorName} — {route.DestinationStation}"
                        : (reg.ContractorName ?? reg.DestinationStation ?? "—");
                }

                wagonRows.Add(new YukXatiPdfWagonRow(
                    Index: idx++,
                    WagonNumber: unit.WagonNumber,
                    CisternNumber: unit.CisternNumber,
                    WagonType: string.Equals(unit.WagonType, "sisterna", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(unit.WagonType) ? "Vagon-sisterna" : unit.WagonType,
                    ProductType: unit.ProductType ?? arrival?.ProductType,
                    TareWeight: tare,
                    BruttoWeight: brutto,
                    NettoWeight: netto,
                    SealNumbers: isDefective ? null : unit.SealNumber,
                    Status: unit.Status,
                    ReceiverAndStation: receiverStation,
                    IsDefective: isDefective,
                    DefectActFileName: unit.DefectActFileName ?? unit.DefectActNumber
                ));
            }
        }
        else
        {
            foreach (var unit in units)
            {
                EmptyWagonUnitSync.TryParseWeight(unit.TareWeight, out var tare);
                EmptyWagonUnitSync.TryParseWeight(unit.GrossWeight, out var brutto);
                EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var netto);

                bool isDefective = unit.Status == EmptyWagonUnitStatuses.Returned;
                string receiverStation = isDefective
                    ? $"Nomuvofiqlik aniqlangan · {unit.DefectActNumber ?? unit.DefectActFileName ?? "Dalolatnoma"}"
                    : (reg.ContractorName ?? reg.DestinationStation ?? "—");

                if (isDefective) { tare = 0; brutto = 0; netto = 0; }

                wagonRows.Add(new YukXatiPdfWagonRow(
                    Index: idx++,
                    WagonNumber: unit.WagonNumber,
                    CisternNumber: unit.CisternNumber,
                    WagonType: string.Equals(unit.WagonType, "sisterna", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(unit.WagonType) ? "Vagon-sisterna" : unit.WagonType,
                    ProductType: unit.ProductType ?? arrival?.ProductType,
                    TareWeight: tare,
                    BruttoWeight: brutto,
                    NettoWeight: netto,
                    SealNumbers: isDefective ? null : unit.SealNumber,
                    Status: unit.Status,
                    ReceiverAndStation: receiverStation,
                    IsDefective: isDefective,
                    DefectActFileName: unit.DefectActFileName ?? unit.DefectActNumber
                ));
            }
        }

        var totalTareKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.TareWeight);
        var totalBruttoKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.BruttoWeight);
        var totalNettoKg = wagonRows.Where(w => !w.IsDefective).Sum(w => w.NettoWeight) > 0
            ? wagonRows.Where(w => !w.IsDefective).Sum(w => w.NettoWeight)
            : reg.OrderDeductedNetWeight;

        var warehouseSignerName = !string.IsNullOrWhiteSpace(arrival?.LoadingCompletedByName) ? arrival.LoadingCompletedByName : (!string.IsNullOrWhiteSpace(arrival?.CreatedBy?.FullName) ? arrival.CreatedBy.FullName : "Javliyev Nematilla Tilovovich");
        var warehouseSignerAt = arrival?.LoadingCompletedAt ?? arrival?.CreatedAt ?? reg.PreparedAt;
        var scaleSignerName = unitsByNumber.Values.Select(u => u.SealConfirmedByScaleName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))
            ?? "Kamolov Xikmat Abdurazzoq og'li";
        var scaleSignerAt = unitsByNumber.Values.Select(u => u.GrossWeighedAt).FirstOrDefault(t => t != null)
            ?? unitsByNumber.Values.Select(u => u.TareWeighedAt).FirstOrDefault(t => t != null)
            ?? reg.PreparedAt;
        var isShiftApproved = reg.IsApprovedByShiftSupervisor;
        var isEcoApproved = reg.IsEconomistApprovedWithPermit || reg.IsApprovedByShiftSupervisor || (reg.IsApprovedByPermit && reg.IsApprovedBySecurity);
        var isPermitApproved = reg.IsApprovedByPermit;
        var isSecurityApproved = reg.IsApprovedBySecurity;

        var economistSignerName = (isShiftApproved || isEcoApproved)
            ? (FirstName(reg.ShiftSupervisorApprovedByName, reg.EconomistApprovedByName, reg.PreparedByName))
            : "—";
        var economistSignerAt = (isShiftApproved || isEcoApproved)
            ? (reg.ShiftSupervisorApprovedAt ?? reg.EconomistApprovedWithPermitAt ?? reg.EconomistApprovedAt ?? reg.PreparedAt)
            : (DateTime?)null;

        var permitSignerName = isPermitApproved ? (reg.PermitApprovedByName ?? "—") : "—";
        var permitSignerAt = isPermitApproved ? reg.PermitApprovedAt : (DateTime?)null;

        var securitySignerName = isSecurityApproved ? (reg.SecurityApprovedByName ?? "—") : "—";
        var securitySignerAt = isSecurityApproved ? reg.SecurityApprovedAt : (DateTime?)null;

        var signersList = new List<YukXatiPdfSigner>
        {
            new("warehouse", "Tayyor mahsulotlar va xom ashyo sexi", "Yuklandi", warehouseSignerName, warehouseSignerAt),
            new("scale", "Tarozi operatori", "Tarozida tortildi", scaleSignerName, scaleSignerAt),
            new("economist", "ICHDX iqtisodchisi", (isShiftApproved || isEcoApproved) ? "Yuk xati shakllantirildi" : "Kutilmoqda", economistSignerName, economistSignerAt),
            new("permit", "Ruxsatnoma byurosi xodimi", isPermitApproved ? "Kelishildi" : "Kutilmoqda", permitSignerName, permitSignerAt),
            new("security", "Qo‘riqlash xizmati (NO‘J) xodimi", isSecurityApproved ? "Kelishildi" : "Kutilmoqda", securitySignerName, securitySignerAt)
        };

        return new YukXatiPdfModel(
            RegistryNumber: reg.RegistryNumber,
            OrderNumber: reg.OrderNumber,
            CustomerName: reg.ContractorName,
            DestinationStation: reg.DestinationStation,
            ProductType: arrival?.ProductType ?? "Suyultirilgan gaz",
            WagonCount: wagonRows.Count,
            TotalTare: totalTareKg,
            TotalBrutto: totalBruttoKg,
            TotalNetto: totalNettoKg,
            PreparedAt: reg.PreparedAt,
            PreparedByName: reg.PreparedByName,
            InspectorName: reg.ShiftSupervisorApprovedByName,
            SecurityOfficerName: reg.SecurityApprovedByName,
            QrVerificationUrl: reg.QrVerificationUrl,
            QrGlobalId: reg.QrGlobalId,
            Wagons: wagonRows,
            LoadingTaskNo: arrival?.ArrivalNumber,
            ExitDate: reg.ExitedToKengsoyAt,
            ContractNo: reg.ContractNumber ?? "01-36/22-44",
            PermitOk: reg.IsApprovedByPermit && reg.IsApprovedBySecurity,
            ShiftLeaderName: reg.ShiftSupervisorApprovedByName,
            ShiftLeaderAt: reg.ShiftSupervisorApprovedAt,
            Signers: signersList
        );
    }

}
