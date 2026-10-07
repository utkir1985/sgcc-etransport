namespace ETransport.Core.Constants;

public static class WagonOwnership
{
    public const string Majmua = "majmua";
    public const string Tashqi = "tashqi";

    public static readonly string[] All = [Majmua, Tashqi];

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && All.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase);

    public static string Normalize(string? value) =>
        string.Equals(value?.Trim(), Majmua, StringComparison.OrdinalIgnoreCase) ? Majmua : Tashqi;
}
