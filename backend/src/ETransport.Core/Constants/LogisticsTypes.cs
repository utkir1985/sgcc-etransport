namespace ETransport.Core.Constants;

public static class LogisticsTypes
{
    public const string Railway = "Railway";
    public const string Road = "Road";

    public static readonly string[] All = [Railway, Road];

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && All.Contains(value);
}
