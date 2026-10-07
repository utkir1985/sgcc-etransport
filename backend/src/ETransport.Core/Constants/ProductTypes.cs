namespace ETransport.Core.Constants;

/// <summary>
/// Marketing oylik buyurtmalari — logistika turiga qarab mahsulotlar.
/// </summary>
public static class ProductTypes
{
    public const string EthylenePolymers = "Etilenning polimerlari (polietilen)";
    public const string Lpg = "Suyultirilgan gaz";
    public const string AllSulfur = "Barcha turdagi oltingugurt";
    public const string GasCondensate = "Tabiiy gaz kondensati";
    public const string Buten1 = "Buten-1";
    public const string PolyethyleneWaste = "Polietilen otxod";

    public static string DefaultOrderPrefix(string productType) => productType switch
    {
        EthylenePolymers => "PE",
        Lpg => "SG",
        AllSulfur => "OL",
        GasCondensate => "GK",
        Buten1 => "B1",
        PolyethyleneWaste => "PO",
        _ => string.Empty,
    };

    public static readonly string[] RailwayAll =
    [
        EthylenePolymers,
        Lpg,
        AllSulfur,
        GasCondensate,
        Buten1,
    ];

    public static readonly string[] RoadAll =
    [
        EthylenePolymers,
        AllSulfur,
        GasCondensate,
        PolyethyleneWaste,
    ];

    public static string[] GetForLogistics(string logisticsType) =>
        logisticsType switch
        {
            LogisticsTypes.Railway => RailwayAll,
            LogisticsTypes.Road => RoadAll,
            _ => [],
        };

    public static bool IsValidForLogistics(string logisticsType, string? productType) =>
        !string.IsNullOrWhiteSpace(productType) && GetForLogistics(logisticsType).Contains(productType);

    public static string DefaultForLogistics(string logisticsType) =>
        GetForLogistics(logisticsType).FirstOrDefault() ?? RailwayAll[0];
}
