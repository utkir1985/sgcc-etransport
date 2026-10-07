namespace ETransport.Core.Constants;

public static class LineAccountingStatuses
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string PendingDeputy = "PendingDeputy";
    public const string PendingDispatch = "PendingDispatch";
    public const string DispatchApproved = "DispatchApproved";

    public static readonly string[] All =
        [Pending, Approved, Rejected, PendingDeputy, PendingDispatch, DispatchApproved];

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && All.Contains(value);

    public static string Normalize(string? value) =>
        IsValid(value) ? value! : Pending;
}
