namespace ETransport.Core.Constants;

public static class OrderQuantityUnits
{
    public const string Wagon = "wagon";
    public const string Ton = "ton";

    public static readonly string[] All = [Wagon, Ton];

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && All.Contains(value);

    public static string Normalize(string? value) =>
        IsValid(value) ? value! : Wagon;
}
