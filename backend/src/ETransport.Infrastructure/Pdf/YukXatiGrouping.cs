namespace ETransport.Infrastructure.Pdf;

/// <summary>Ajratma PDF uchun: asosiy yuk xati raqami va ajratmaning tartibi (3 / 4).</summary>
public record YukXatiPartInfo(string ParentRegistryNumber, int PartNo, int PartCount);

/// <summary>Yuk xati ichidagi bitta qabul qiluvchi guruhi (shartnoma + qabul qiluvchi tashkilot va stansiya).</summary>
public sealed record YukXatiWagonGroup(
    string Number,
    int PartNo,
    string ContractNumber,
    string Receiver,
    List<YukXatiPdfWagonRow> Rows,
    bool IsDefectiveSection = false)
{
    public int WagonCount => Rows.Count;
    public decimal TareKg => Rows.Sum(r => YukXatiGrouping.Kg(r.TareWeight));
    public decimal BruttoKg => Rows.Sum(r => YukXatiGrouping.Kg(r.BruttoWeight));
    public decimal NettoKg => Rows.Sum(r => YukXatiGrouping.Kg(r.NettoWeight));
}

/// <summary>
/// Yuk xati vagonlarini "shartnoma + qabul qiluvchi" bo‘yicha guruhlash.
/// Guruhlar jadvaldagi birinchi vagon tartibida raqamlanadi: bir nechta guruh bo‘lsa WB-1026-030-1, -2, ...;
/// bitta guruh bo‘lsa — qo‘shimchasiz asosiy raqam. Nomuvofiq vagonlar alohida bo‘limga tushadi va ajratma bo‘lmaydi.
/// Frontenddagi <c>groupYukXatiWagons</c> bilan bir xil qoidada ishlaydi.
/// </summary>
public static class YukXatiGrouping
{
    /// <summary>Ajratmalar (WB-…-N) shu sanadan keyin qo‘riqlashdan o‘tgan yuk xatlariga beriladi: 01.10.2026 00:00 (UZT).</summary>
    public static readonly DateTime PartsFromUtc = new(2026, 9, 30, 19, 0, 0, DateTimeKind.Utc);

    /// <summary>Qo‘riqlashgacha raqamlar ko‘rinadi; qo‘riqlangan eski hujjatlarda ajratma yo‘q — guruhlar raqamsiz.</summary>
    public static bool IssuesParts(ETransport.Core.Entities.LoadingRegistry r) =>
        !r.IsApprovedBySecurity || (r.SecurityApprovedAt ?? r.PreparedAt) >= PartsFromUtc;

    public static decimal Kg(decimal w) => (w > 0 && w < 1000) ? Math.Round(w * 1000m, 0) : w;

    public static bool IsDefective(YukXatiPdfWagonRow w) =>
        w.IsDefective || w.Status == "Returned" || (w.ReceiverAndStation?.Contains("Nomuvofiqlik") == true);

    private static string ContractFallback(string? registryContract) =>
        string.IsNullOrWhiteSpace(registryContract) || registryContract.Contains("Bir nechta", StringComparison.OrdinalIgnoreCase)
            ? "—"
            : registryContract.Trim();

    public static string PartNumber(string registryNumber, int partNo) => $"{registryNumber}-{partNo}";

    public static List<YukXatiWagonGroup> Group(YukXatiPdfModel model, bool numberedParts = true)
    {
        var rows = model.Wagons ?? [];
        var fallbackReceiver = model.CustomerName ?? model.DestinationStation ?? "—";
        var order = new List<(string Contract, string Receiver)>();
        var buckets = new Dictionary<string, List<YukXatiPdfWagonRow>>(StringComparer.OrdinalIgnoreCase);
        var defective = new List<YukXatiPdfWagonRow>();

        foreach (var row in rows)
        {
            if (IsDefective(row)) { defective.Add(row); continue; }
            var contract = string.IsNullOrWhiteSpace(row.ContractNumber) ? ContractFallback(model.ContractNo) : row.ContractNumber.Trim();
            var receiver = string.IsNullOrWhiteSpace(row.ReceiverAndStation) ? fallbackReceiver : row.ReceiverAndStation.Trim();
            var key = $"{contract}|{receiver}";
            if (!buckets.TryGetValue(key, out var list))
            {
                buckets[key] = list = [];
                order.Add((contract, receiver));
            }
            list.Add(row);
        }

        var split = numberedParts && order.Count > 1;
        var groups = order.Select((g, i) => new YukXatiWagonGroup(
            Number: split ? PartNumber(model.RegistryNumber, i + 1) : model.RegistryNumber,
            PartNo: split ? i + 1 : 0,
            ContractNumber: g.Contract,
            Receiver: g.Receiver,
            Rows: buckets[$"{g.Contract}|{g.Receiver}"])).ToList();

        if (defective.Count > 0)
            groups.Add(new YukXatiWagonGroup("", 0, "—", "Nomuvofiqlik aniqlangan vagonlar (yuk xatiga kirmaydi)", defective, IsDefectiveSection: true));
        return groups;
    }

    /// <summary>Bir nechta qabul qiluvchi bo‘lsa — ajratmalar (nomuvofiq bo‘limsiz); aks holda bo‘sh.</summary>
    public static List<YukXatiWagonGroup> Parts(YukXatiPdfModel model)
    {
        var groups = Group(model).Where(g => !g.IsDefectiveSection).ToList();
        return groups.Count > 1 ? groups : [];
    }

    /// <summary>Ajratma PDF modeli: faqat shu guruh vagonlari, o‘z jamilari, raqami va QR'i bilan.</summary>
    public static YukXatiPdfModel PartModel(YukXatiPdfModel master, YukXatiWagonGroup part,
        string? qrVerificationUrl, string? qrGlobalId)
    {
        var products = part.Rows.Select(r => r.ProductType).Where(p => !string.IsNullOrWhiteSpace(p)).Distinct().ToList();
        return master with
        {
            RegistryNumber = part.Number,
            CustomerName = part.Receiver,
            ContractNo = part.ContractNumber,
            ProductType = products.Count == 1 ? products[0] : master.ProductType,
            Wagons = part.Rows,
            WagonCount = part.WagonCount,
            TotalTare = part.TareKg,
            TotalBrutto = part.BruttoKg,
            TotalNetto = part.NettoKg,
            QrVerificationUrl = qrVerificationUrl,
            QrGlobalId = qrGlobalId,
        };
    }
}
