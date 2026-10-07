namespace ETransport.Core.Constants;

/// <summary>Kelish holati — qabul vaqtida vagon yuk holati.</summary>
public static class WagonIntakeLoadState
{
    public const string Bosh = "bosh";
    public const string Yukli = "yukli";

    public static readonly string[] All = [Bosh, Yukli];

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && All.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase);

    public static string Normalize(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            Yukli => Yukli,
            "tola" => Yukli,
            _ => Bosh,
        };
}
