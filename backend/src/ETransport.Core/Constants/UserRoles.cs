namespace ETransport.Core.Constants;

public static class UserRoles
{
    public const string Admin = "Admin";
    /// <summary>MS va MX bo'lim boshlig'i (buyurtmani kelishuvga yuboradi).</summary>
    public const string Marketing = "Marketing";
    /// <summary>MS va MX xodimi — buyurtma tayyorlaydi, bo'lim boshlig'i tasdiqlaydi.</summary>
    public const string MarketingStaff = "MarketingStaff";
    public const string Dispatching = "Dispatching";
    public const string DispatchSupervisor = "DispatchSupervisor";
    public const string Accounting = "Accounting";
    public const string Railway = "Railway";
    public const string Road = "Road";
    public const string Warehouse = "Warehouse";
    public const string Scale = "Scale";
    public const string Permit = "Permit";
    public const string Security = "Security";
    public const string Economist = "Economist";
    public const string Management = "Management";
    /// <summary>Bosh direktor o‘rinbosari.</summary>
    public const string DeputyDirector = "DeputyDirector";

    public static readonly string[] All =
    [
        Admin, Marketing, MarketingStaff, Dispatching, DispatchSupervisor, Accounting, Railway, Road,
        Warehouse, Scale, Permit, Security, Economist, Management, DeputyDirector
    ];
}
