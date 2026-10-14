using System.Text.RegularExpressions;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Data;

public static class DbSeeder
{
    private static readonly Regex RootOrderNumber = new(@"^((?:MO-(?:T|A)-\d{4}-\d{3}|[A-Z0-9]{2,10}-\d{5}))", RegexOptions.Compiled);

    private static string GetRootOrderNumber(string orderNumber)
    {
        var match = RootOrderNumber.Match(orderNumber);
        return match.Success ? match.Groups[1].Value : orderNumber;
    }

    public static async Task SeedAsync(AppDbContext db)
    {
        await db.Database.EnsureCreatedAsync();
        try { await EnsureQrLinkColumnsAsync(db); } catch { }
        try { await EnsureUsersAvatarColumnAsync(db); } catch { }
        try { await EnsureUsersDepartmentShortNameColumnAsync(db); } catch { }
        try { await EnsureUsersPositionColumnAsync(db); } catch { }
        try { await EnsureUsersLockoutColumnsAsync(db); } catch { }
        try { await EnsureUsersTokenVersionColumnAsync(db); } catch { }
        await EnsureQuantityUnitColumnAsync(db);
        try { await EnsureTonCountColumnAsync(db); } catch { }
        await EnsureOrderApprovalColumnsAsync(db);
        await EnsureLineAccountingStatusColumnAsync(db);
        await EnsureDispatchApprovalColumnsAsync(db);
        await EnsureAccountingReviewColumnsAsync(db);
        try { await EnsureDeputyApprovalColumnsAsync(db); } catch { }
        // Keyingi data patchlar EF orqali MonthlyOrderLine/EmptyWagonUnit o‘qiydi;
        // yangi ustunlar ulardan oldin mavjud bo‘lishi shart.
        try { await EnsureOrderFulfillmentAndDefectActsAsync(db); } catch { }
        try { await EnsureDeputyDirectorUserAsync(db); } catch { }
        try { await EnsureDispatchSupervisorUserAsync(db); } catch { }
        await ApplyDataPatchesAsync(db);
        try { await EnsureContractorsTableAsync(db); } catch { }
        try { await EnsureContractorsAsync(db); } catch { }
        try { await EnsureContractorDestinationsTableAsync(db); } catch { }
        try { await EnsureContractorDestinationsAsync(db); } catch { }
        try { await EnsureSystemSettingsTableAsync(db); } catch { }
        try { await EnsureCatalogProductsTableAsync(db); } catch { }
        try { await EnsureCatalogProductsAsync(db); } catch { }
        try { await EnsureCatalogWagonTypesTableAsync(db); } catch { }
        try { await EnsureCatalogWagonTypesAsync(db); } catch { }
        try { await EnsureEmptyWagonArrivalsTableAsync(db); } catch { }
        try { await EnsureDailyPlanLinesTableAsync(db); } catch { }
        try { await EnsureEmptyWagonLoadingColumnsAsync(db); } catch { }
        try { await EnsureEntryPermitColumnsAsync(db); } catch { }
        try { await EnsureEmptyWagonUnitsTableAsync(db); } catch { }
        try { await EnsureEmptyWagonSealColumnsAsync(db); } catch { }
        try { await EnsureLoadingBatchColumnsAsync(db); } catch { }
        try { await BackfillLoadingSignersAsync(db); } catch { }
        try { await EnsureFleetOwnershipColumnsAsync(db); } catch { }
        try { await EnsureIntakeLoadStateColumnAsync(db); } catch { }
        try { await EnsureCatalogFleetWagonsTableAsync(db); } catch { }
        try { await EnsureCatalogContainersTableAsync(db); } catch { }
        try { await EnsureLoadingRegistriesTableAsync(db); } catch { }
        try { await EnsureLoadingRegistrySignerColumnsAsync(db); } catch { }
        try { await RestoreHandedOverParkLocationsAsync(db); } catch { }
        try { await EnsureOrderFulfillmentAndDefectActsAsync(db); } catch { }
        try { await RebuildOrderFulfillmentAsync(db); } catch { }
        try { await EnsureMonthlyPlansAsync(db); } catch { }
        try { await EnsureDepartedUnitsExitedAsync(db); } catch { }
        // Partiya endi bir nechta yuk xatiga bo‘linadi; bitta reyestr holatini butun
        // kirish partiyasiga ko‘chiradigan eski reconciliation qo‘llanmaydi.
        try { await EnsureOrderAttachmentsTableAsync(db); } catch { }
        try { await EnsureQrLinkColumnsAsync(db); } catch { }
        try { await EnsureRecycleBinAsync(db); } catch { }

        if (await db.Users.AnyAsync()) return;

        var users = new List<User>
        {
            CreateUser("admin", "Admin123!", "Tizim Administratori", UserRoles.Admin, "IT"),
            CreateUser("marketing", "Marketing123!", "B. Normurodov", UserRoles.Marketing, "MS va MX"),
            CreateUser("ichdx", "Ichdx123!", "A. Karimov", UserRoles.Dispatching, "ICHDX"),
            CreateUser("ichdx_boshliq", "IchdxBoss123!", "ICHDX boshlig‘i", UserRoles.DispatchSupervisor, "ICHDX"),
            CreateUser("buxgalter", "Bux123!", "Sh. Umarov", UserRoles.Accounting, "Buxgalteriya"),
            CreateUser("temiryol", "Rail123!", "Temir yo'l sexi", UserRoles.Railway, "Temir yo'l sexi"),
            CreateUser("avtotransport", "Auto123!", "Avtotransport dispetcheri", UserRoles.Road, "Avtotransport"),
            CreateUser("ombor", "Warehouse123!", "TM va XA smena muxandisi", UserRoles.Warehouse, "TM va XA smena muxandisi"),
            CreateUser("tarozi", "Scale123!", "Tarozi operatori", UserRoles.Scale, "Tarozi"),
            CreateUser("ruxsatnoma", "Permit123!", "Ruxsatnoma byurosi", UserRoles.Permit, "Ruxsatnoma byurosi"),
            CreateUser("qoriqlash", "Security123!", "Qo'riqlash xizmati", UserRoles.Security, "Qo'riqlash"),
            CreateUser("iqtisodchi", "Economist123!", "ICHDX iqtisodchisi", UserRoles.Economist, "ICHDX"),
            CreateUser("rahbar", "Mgmt123!", "Rahbariyat", UserRoles.Management, "Rahbariyat"),
            CreateUser("isayev", "Isayev123!", "O'ktam Isayev", UserRoles.DeputyDirector, "Bosh direktor o'rinbosari"),
        };

        db.Users.AddRange(users);
        await db.SaveChangesAsync();

        var marketingUser = users.First(u => u.Role == UserRoles.Marketing);
        var dispatchUser = users.First(u => u.Role == UserRoles.Dispatching);

        var railOrder = new MonthlyOrder
        {
            OrderNumber = "MO-T-2026-001",
            LogisticsType = LogisticsTypes.Railway,
            ContractNumber = "1442/024 ot 30.12.2025g",
            ProductType = ProductTypes.Lpg,
            Year = 2026,
            Month = 7,
            Deadline = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc),
            Status = OrderStatus.PendingAccounting,
            CreatedById = marketingUser.Id,
            SubmittedAt = DateTime.UtcNow,
            SubmittedById = marketingUser.Id,
            Lines =
            [
                Line(1, "«Hududgaz Andijon» gaz ta'minoti filiali", 10, "Axtachi"),
                Line(2, "«Hududgaz Farg'ona» gaz ta'minoti filiali", 10, "Oltiariq"),
                Line(3, "«Hududgaz Namangan» gaz ta'minoti filiali", 10, "Uychi"),
                Line(4, "«Hududgaz Namangan» gaz ta'minoti filiali", 10, "To'raqo'rg'on"),
                Line(5, "«Hududgaz Samarqand» gaz ta'minoti filiali", 10, "Maroqand"),
                Line(6, "«Hududgaz Samarqand» gaz ta'minoti filiali", 10, "Jomboy"),
                Line(7, "«Hududgaz Sirdaryo» gaz ta'minoti filiali", 10, "Jomboy"),
                Line(8, "«Hududgaz Toshkent» gaz ta'minoti filiali", 4, "Jomboy"),
                Line(9, "«Hududgaz Jizzax» gaz ta'minoti filiali", 10, "Jomboy"),
                Line(10, "«Hududgaz Surxandaryo» gaz ta'minoti filiali", 10, "Oqjar"),
                Line(11, "«Hududgaz Surxandaryo» gaz ta'minoti filiali", 10, "Xayrabod"),
            ],
        };

        var roadOrder = new MonthlyOrder
        {
            OrderNumber = "MO-A-2026-001",
            LogisticsType = LogisticsTypes.Road,
            ContractNumber = "AT-118/2026 ot 15.01.2026g",
            ProductType = ProductTypes.EthylenePolymers,
            Year = 2026,
            Month = 1,
            Deadline = new DateTime(2026, 1, 31, 0, 0, 0, DateTimeKind.Utc),
            Status = OrderStatus.Active,
            CreatedById = marketingUser.Id,
            Lines =
            [
                Line(1, "«Hududgaz Toshkent» filiali", 6, "Toshkent sh., Chilonzor"),
                Line(2, "«Hududgaz Samarqand» filiali", 4, "Samarqand vil., Payariq"),
                Line(3, "«Hududgaz Qashqadaryo» filiali", 5, "Qarshi sh., Sanoatchilar"),
            ],
        };

        db.MonthlyOrders.AddRange(railOrder, roadOrder);
        await db.SaveChangesAsync();

        var plan = new DailyPlan
        {
            PlanNumber = "DP-2026-001",
            MonthlyOrderId = railOrder.Id,
            PlanDate = DateTime.UtcNow.Date,
            PlannedWagons = 5,
            PlannedAmount = 300,
            Notes = "Kunlik yuklash rejasi (temir yo'l)",
            Status = PlanStatus.Approved,
            CreatedById = dispatchUser.Id,
            ApprovedByMarketingId = marketingUser.Id,
        };
        db.DailyPlans.Add(plan);
        await db.SaveChangesAsync();

        var firstStation = railOrder.Lines.OrderBy(l => l.SortOrder).First().DestinationStation;
        db.Shipments.Add(new Shipment
        {
            ShipmentNumber = "SH-T-2026-001",
            DailyPlanId = plan.Id,
            ProductType = railOrder.ProductType,
            LogisticsType = LogisticsTypes.Railway,
            Status = ShipmentStatus.Created,
            DestinationStation = firstStation,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Eski versiyada unit sinxronlash terminal hujjat statuslarini yana Sealed ga
    /// tushirib yuborishi mumkin edi. LoadingRegistry dalillaridan partiyaning eng
    /// yuqori erishilgan bosqichini qayta tiklaymiz.
    /// </summary>
    private static async Task ReconcileLoadingRegistryStagesAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            UPDATE "EmptyWagonArrivals" AS a
            SET "Stage" = CASE
                WHEN r."ExitedToKengsoyAt" IS NOT NULL THEN 'Exited'
                WHEN r."IsSentToOneC" AND r."IsSentToENakl" THEN 'DocumentsIssued'
                WHEN r."IsApprovedByPermit" AND r."IsApprovedBySecurity" THEN 'PermitAndSecurityApproved'
                ELSE 'RegistryPrepared'
            END
            FROM "LoadingRegistries" AS r
            WHERE r."EmptyWagonArrivalId" = a."Id"
              AND a."Stage" <> 'Cancelled';
            """);
    }

    private static async Task EnsureEntryPermitColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitNumber" character varying(80) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitShiftApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitShiftApprovedByName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitPermitApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitPermitApprovedByName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitSecurityApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitSecurityApprovedByName" character varying(200) NOT NULL DEFAULT '';
            UPDATE "EmptyWagonArrivals"
            SET "EntryPermitNumber" = 'PR-' || to_char("CreatedAt" AT TIME ZONE 'Asia/Tashkent', 'DDMMYYYY') || '-' || upper(substr("Id"::text, 1, 4))
            WHERE COALESCE("EntryPermitNumber", '') = '' AND "ArrivalNumber" NOT LIKE '1C-%';
            """);
    }

    private static async Task EnsureUsersDepartmentShortNameColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "DepartmentShortName" character varying(100) NOT NULL DEFAULT '';
            UPDATE "Users"
            SET "DepartmentShortName" = CASE
                WHEN "Role" IN ('Dispatching', 'DispatchSupervisor', 'Economist') THEN 'ICHDX'
                WHEN "Role" = 'Marketing' THEN 'MS va MX'
                ELSE "Department"
            END
            WHERE COALESCE("DepartmentShortName", '') = '';
            UPDATE "Users"
            SET "Department" = 'Ishlab chiqarish dispetcherlik xizmati'
            WHERE "Role" IN ('Dispatching', 'DispatchSupervisor', 'Economist')
              AND "Department" = 'ICHDX';
            """);
    }

    /// <summary>Login'ga qo'pol kuch (brute-force) hujumidan himoya uchun bloklash ustunlari.</summary>
    private static async Task EnsureUsersLockoutColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "FailedLoginAttempts" integer NOT NULL DEFAULT 0;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "LockoutEnd" timestamp with time zone NULL;
            """);
    }

    private static async Task EnsureUsersPositionColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "Position" character varying(250) NOT NULL DEFAULT '';
            UPDATE "Users"
            SET "Position" = CASE
                WHEN "Role" = 'Admin' THEN 'Administrator'
                WHEN "Role" = 'Marketing' THEN 'Mutaxassis'
                WHEN "Role" = 'Dispatching' THEN 'Smena boshlig‘i'
                WHEN "Role" = 'DispatchSupervisor' THEN 'Xizmat boshlig‘i'
                WHEN "Role" = 'Accounting' THEN 'Buxgalter'
                WHEN "Role" = 'Railway' THEN 'Temir yo‘l mutaxassisi'
                WHEN "Role" = 'Road' THEN 'Avtotransport dispetcheri'
                WHEN "Role" = 'Warehouse' THEN 'Smena muhandisi'
                WHEN "Role" = 'Scale' THEN 'Tarozi operatori'
                WHEN "Role" = 'Permit' THEN 'Ruxsatnoma byurosi xodimi'
                WHEN "Role" = 'Security' THEN 'Qo‘riqlash xizmati xodimi'
                WHEN "Role" = 'Economist' THEN 'Iqtisodchi'
                WHEN "Role" = 'Management' THEN 'Rahbariyat'
                WHEN "Role" = 'DeputyDirector' THEN 'Bosh direktor o‘rinbosari'
                ELSE 'Xodim'
            END
            WHERE COALESCE("Position", '') = '';
            """);
    }

    private static async Task EnsureQuantityUnitColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrderLines"
            ADD COLUMN IF NOT EXISTS "QuantityUnit" character varying(20) NOT NULL DEFAULT 'wagon';
            """);
    }

    private static async Task EnsureTonCountColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrderLines"
            ADD COLUMN IF NOT EXISTS "TonCount" numeric(18,3) NOT NULL DEFAULT 0;
            ALTER TABLE "MonthlyOrderLines"
            ALTER COLUMN "TonCount" TYPE numeric(18,3);
            """);
        // Eski tonna-birlikli qatorlar: miqdor WagonCount da edi
        await db.Database.ExecuteSqlRawAsync("""
            UPDATE "MonthlyOrderLines"
            SET "TonCount" = "WagonCount"
            WHERE "QuantityUnit" = 'ton' AND "TonCount" = 0 AND "WagonCount" > 0;
            """);
    }

    private static async Task EnsureOrderApprovalColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "SubmittedAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "SubmittedById" uuid NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "ApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "ApprovedByAccountingId" uuid NULL;
            """);
    }

    private static async Task EnsureLineAccountingStatusColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrderLines"
            ADD COLUMN IF NOT EXISTS "AccountingStatus" character varying(30) NOT NULL DEFAULT 'Pending';
            """);
    }

    private static async Task EnsureDispatchApprovalColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "SubmittedToDispatchAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "SubmittedToDispatchById" uuid NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "DispatchApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "ApprovedByDispatchId" uuid NULL;
            """);
    }

    private static async Task EnsureAccountingReviewColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrderLines"
            ADD COLUMN IF NOT EXISTS "AccountingReviewChecked" boolean NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "AccountingApproverName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "MarketingApproverName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "MarketingApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "ApprovedByMarketingId" uuid NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "DispatchApproverName" character varying(200) NOT NULL DEFAULT '';
            """);
    }

    private static async Task EnsureDeputyApprovalColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "DeputyApproverName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "DeputyApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders"
            ADD COLUMN IF NOT EXISTS "ApprovedByDeputyId" uuid NULL;
            """);
    }

    private static async Task EnsureDeputyDirectorUserAsync(AppDbContext db)
    {
        if (await db.Users.AnyAsync(u => u.Username == "isayev" || u.Role == UserRoles.DeputyDirector))
            return;

        db.Users.Add(CreateUser(
            "isayev",
            "Isayev123!",
            "O'ktam Isayev",
            UserRoles.DeputyDirector,
            "Bosh direktor o'rinbosari"));
        await db.SaveChangesAsync();
    }

    private static async Task EnsureDispatchSupervisorUserAsync(AppDbContext db)
    {
        if (await db.Users.AnyAsync(u => u.Username == "ichdx_boshliq"))
            return;

        db.Users.Add(CreateUser(
            "ichdx_boshliq",
            "IchdxBoss123!",
            "ICHDX boshlig‘i",
            UserRoles.DispatchSupervisor,
            "ICHDX"));
        await db.SaveChangesAsync();
    }

    private static async Task ApplyDataPatchesAsync(AppDbContext db)
    {
        var changed = false;

        var railOrder = await db.MonthlyOrders
            .FirstOrDefaultAsync(o =>
                o.OrderNumber == "MO-T-2026-001" && o.LogisticsType == LogisticsTypes.Railway);

        if (railOrder is { Year: 2026, Month: 1 })
        {
            railOrder.Month = 7;
            railOrder.Deadline = new DateTime(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);
            changed = true;
        }

        // Marketing oraliq tasdiq olib tashlandi: ReadyForDispatch → o‘rinbosarga
        var readyForDispatch = await db.MonthlyOrders
            .Include(o => o.Lines)
            .Where(o => o.Status == OrderStatus.ReadyForDispatch)
            .ToListAsync();
        foreach (var order in readyForDispatch)
        {
            var lines = order.Lines.Where(l => l.MonthlyOrderId == order.Id).ToList();
            if (lines.Count == 0 || lines.Any(l => l.AccountingStatus == LineAccountingStatuses.Rejected))
                continue;
            if (!lines.All(l => l.AccountingStatus is LineAccountingStatuses.Approved or LineAccountingStatuses.PendingDeputy))
                continue;

            foreach (var line in lines.Where(l => l.AccountingStatus == LineAccountingStatuses.Approved))
                line.AccountingStatus = LineAccountingStatuses.PendingDeputy;
            order.Status = OrderStatus.PendingDeputyDirector;
            changed = true;
        }

        if (railOrder is not null && railOrder.ApprovedAt is null && railOrder.DispatchApprovedAt is null
            && railOrder.Status == OrderStatus.Active)
        {
            var marketingUser = await db.Users.FirstOrDefaultAsync(u => u.Role == UserRoles.Marketing);
            railOrder.Status = OrderStatus.PendingAccounting;
            railOrder.SubmittedAt ??= DateTime.UtcNow;
            if (railOrder.SubmittedById is null && marketingUser is not null)
                railOrder.SubmittedById = marketingUser.Id;

            railOrder.MarketingApproverName = "";
            railOrder.AccountingApproverName = "";
            railOrder.DispatchApproverName = "";

            foreach (var line in await db.MonthlyOrderLines
                         .Where(l => l.MonthlyOrderId == railOrder.Id)
                         .ToListAsync())
            {
                line.AccountingStatus = LineAccountingStatuses.Pending;
                line.AccountantSigned = false;
            }

            changed = true;
        }

        var returnedOrders = await db.MonthlyOrders
            .Where(o => o.Status == OrderStatus.ReturnedToMarketing)
            .ToListAsync();
        foreach (var order in returnedOrders)
        {
            order.Status = OrderStatus.PendingAccounting;
            changed = true;
        }

        var railwayOrders = await db.MonthlyOrders
            .Where(o => o.LogisticsType == LogisticsTypes.Railway)
            .ToListAsync();

        foreach (var order in railwayOrders)
        {
            var mapped = MapLegacyRailwayProductType(order.ProductType);
            if (mapped is not null && order.ProductType != mapped)
            {
                order.ProductType = mapped;
                changed = true;
            }
        }

        var railwayShipments = await db.Shipments
            .Where(s => s.LogisticsType == LogisticsTypes.Railway)
            .ToListAsync();

        foreach (var shipment in railwayShipments)
        {
            var mapped = MapLegacyRailwayProductType(shipment.ProductType);
            if (mapped is not null && shipment.ProductType != mapped)
            {
                shipment.ProductType = mapped;
                changed = true;
            }
        }

        var ordersWithLines = await db.MonthlyOrders
            .Include(o => o.Lines)
            .ToListAsync();

        changed = await MergeApprovedSplitOrdersAsync(db, ordersWithLines) || changed;

        foreach (var order in ordersWithLines.Where(o => db.Entry(o).State != EntityState.Deleted))
        {
            var ownLines = order.Lines.Where(l => l.MonthlyOrderId == order.Id).ToList();
            if (ownLines.Count == 0) continue;

            var nextStatus = ComputeOrderStatusFromLines(ownLines);
            if (order.Status != nextStatus)
            {
                order.Status = nextStatus;
                changed = true;
            }
        }

        if (changed)
            await db.SaveChangesAsync();
    }

    private static async Task<bool> MergeApprovedSplitOrdersAsync(
        AppDbContext db, List<MonthlyOrder> orders)
    {
        var changed = false;

        foreach (var split in orders.Where(o => o.OrderNumber.Contains("-M", StringComparison.Ordinal)).ToList())
        {
            var rootNumber = GetRootOrderNumber(split.OrderNumber);
            if (rootNumber == split.OrderNumber) continue;

            var parent = orders.FirstOrDefault(o => o.OrderNumber == rootNumber)
                ?? await db.MonthlyOrders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.OrderNumber == rootNumber);
            if (parent is null) continue;

            var splitLines = split.Lines.Where(l => l.MonthlyOrderId == split.Id).ToList();
            if (splitLines.Count == 0) continue;

            var mergeable = splitLines.All(l =>
                l.AccountingStatus is LineAccountingStatuses.Approved
                    or LineAccountingStatuses.PendingDispatch
                    or LineAccountingStatuses.DispatchApproved);

            if (!mergeable) continue;

            var parentLines = parent.Lines.Where(l => l.MonthlyOrderId == parent.Id).ToList();
            var maxSort = parentLines.Count > 0 ? parentLines.Max(l => l.SortOrder) : 0;

            foreach (var line in splitLines)
            {
                line.MonthlyOrderId = parent.Id;
                line.SortOrder = ++maxSort;
            }

            if (!string.IsNullOrWhiteSpace(split.AccountingApproverName))
                parent.AccountingApproverName = split.AccountingApproverName;

            db.MonthlyOrders.Remove(split);
            orders.Remove(split);
            changed = true;
        }

        return changed;
    }

    private static OrderStatus ComputeOrderStatusFromLines(IReadOnlyCollection<MonthlyOrderLine> lines)
    {
        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.Pending))
            return OrderStatus.PendingAccounting;

        if (lines.All(l => l.AccountingStatus == LineAccountingStatuses.DispatchApproved))
            return OrderStatus.Active;

        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.PendingDispatch))
            return OrderStatus.PendingDispatching;

        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.PendingDeputy))
            return OrderStatus.PendingDeputyDirector;

        if (lines.Any(l => l.AccountingStatus == LineAccountingStatuses.Rejected))
            return OrderStatus.ReturnedToMarketing;

        if (lines.All(l => l.AccountingStatus == LineAccountingStatuses.Approved))
            return OrderStatus.ReadyForDispatch;

        return OrderStatus.Draft;
    }

    private static async Task EnsureContractorsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "Contractors" (
                "Id" uuid NOT NULL,
                "Name" character varying(300) NOT NULL,
                "LogisticsType" character varying(20) NOT NULL,
                "IsSystem" boolean NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_Contractors" PRIMARY KEY ("Id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Contractors_LogisticsType_Name"
                ON "Contractors" ("LogisticsType", "Name");
            """);
    }

    private static async Task EnsureSystemSettingsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "SystemSettings" (
                "Key" character varying(100) NOT NULL,
                "Value" text NOT NULL,
                "UpdatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_SystemSettings" PRIMARY KEY ("Key")
            );
            """);
    }

    private static async Task EnsureCatalogProductsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "CatalogProducts" (
                "Id" uuid NOT NULL,
                "Name" character varying(300) NOT NULL,
                "LogisticsType" character varying(20) NOT NULL,
                "OrderPrefix" character varying(10) NOT NULL DEFAULT '',
                "SortOrder" integer NOT NULL,
                "IsActive" boolean NOT NULL,
                "IsSystem" boolean NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_CatalogProducts" PRIMARY KEY ("Id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogProducts_LogisticsType_Name"
                ON "CatalogProducts" ("LogisticsType", "Name");
            ALTER TABLE "CatalogProducts"
                ADD COLUMN IF NOT EXISTS "OrderPrefix" character varying(10) NOT NULL DEFAULT '';
            UPDATE "CatalogProducts"
            SET "OrderPrefix" = CASE "Name"
                WHEN 'Etilenning polimerlari (polietilen)' THEN 'PE'
                WHEN 'Suyultirilgan gaz' THEN 'SG'
                WHEN 'Barcha turdagi oltingugurt' THEN 'OL'
                WHEN 'Tabiiy gaz kondensati' THEN 'GK'
                WHEN 'Buten-1' THEN 'B1'
                WHEN 'Polietilen otxod' THEN 'PO'
                ELSE "OrderPrefix"
            END
            WHERE "OrderPrefix" = '';
            CREATE INDEX IF NOT EXISTS "IX_CatalogProducts_OrderPrefix"
                ON "CatalogProducts" ("OrderPrefix");
            """);
    }

    private static async Task EnsureCatalogProductsAsync(AppDbContext db)
    {
        var existing = await db.CatalogProducts
            .Select(p => new { p.LogisticsType, p.Name })
            .ToListAsync();
        var existingKeys = existing
            .Select(p => $"{p.LogisticsType}::{p.Name}")
            .ToHashSet(StringComparer.Ordinal);

        var products = new List<CatalogProduct>();
        var sort = 0;
        foreach (var name in ProductTypes.RailwayAll)
        {
            var key = $"{LogisticsTypes.Railway}::{name}";
            if (!existingKeys.Contains(key))
            {
                products.Add(new CatalogProduct
                {
                    Name = name,
                    LogisticsType = LogisticsTypes.Railway,
                    OrderPrefix = ProductTypes.DefaultOrderPrefix(name),
                    SortOrder = sort,
                    IsActive = true,
                    IsSystem = true,
                });
            }
            sort++;
        }

        sort = 0;
        foreach (var name in ProductTypes.RoadAll)
        {
            var key = $"{LogisticsTypes.Road}::{name}";
            if (!existingKeys.Contains(key))
            {
                products.Add(new CatalogProduct
                {
                    Name = name,
                    LogisticsType = LogisticsTypes.Road,
                    OrderPrefix = ProductTypes.DefaultOrderPrefix(name),
                    SortOrder = sort,
                    IsActive = true,
                    IsSystem = true,
                });
            }
            sort++;
        }

        if (products.Count == 0) return;
        db.CatalogProducts.AddRange(products);
        await db.SaveChangesAsync();
    }

    private static async Task EnsureCatalogWagonTypesTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "CatalogWagonTypes" (
                "Id" uuid NOT NULL,
                "Name" character varying(300) NOT NULL,
                "Code" character varying(100) NULL,
                "Description" character varying(500) NULL,
                "SortOrder" integer NOT NULL,
                "IsActive" boolean NOT NULL,
                "IsSystem" boolean NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_CatalogWagonTypes" PRIMARY KEY ("Id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogWagonTypes_Name"
                ON "CatalogWagonTypes" ("Name");
            """);
    }

    private static async Task EnsureCatalogWagonTypesAsync(AppDbContext db)
    {
        var defaultTypes = new[]
        {
            "Suyultirilgan gaz mahsuloti uchun Vagon sisterna",
            "Gaz kondensati uchun Vagon sisterna",
            "Granula uchun Yopiq turdagi vagon",
            "Sera uchun Yopiq turdagi vagon",
            "Suyultirilgan gaz mahsuloti uchun Konteyner sisterna",
            "Konteyner sisterna yuklash uchun Fiting platforma"
        };

        var existingNames = (await db.CatalogWagonTypes
            .Select(w => w.Name)
            .ToListAsync())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var wagonTypes = new List<CatalogWagonType>();
        var sort = 0;
        foreach (var name in defaultTypes)
        {
            if (!existingNames.Contains(name))
            {
                wagonTypes.Add(new CatalogWagonType
                {
                    Name = name,
                    SortOrder = sort,
                    IsActive = true,
                    IsSystem = true
                });
            }
            sort++;
        }

        if (wagonTypes.Count == 0) return;
        db.CatalogWagonTypes.AddRange(wagonTypes);
        await db.SaveChangesAsync();
    }

    private static async Task EnsureContractorsAsync(AppDbContext db)
    {
        var rogueNames = new[]
        {
            "1C (plombali tortish)",
            "Hududgaz Andijon",
            "Hududgaz Jizzax",
            "Hududgaz Farg'ona",
            "Hududgaz Namangan",
            "Hududgaz Samarqand",
            "Hududgaz Toshkent",
            "Hududgaz Sirdaryo",
            "Hududgaz Surxandaryo",
            "Hududgaz Qashqadaryo"
        };
        var rogues = await db.Contractors.Where(c => rogueNames.Contains(c.Name)).ToListAsync();
        if (rogues.Count > 0)
        {
            db.Contractors.RemoveRange(rogues);
            await db.SaveChangesAsync();
        }

        var railwayNames = new[]
        {
            "«Hududgaz Andijon» gaz ta'minoti filiali",
            "«Hududgaz Farg'ona» gaz ta'minoti filiali",
            "«Hududgaz Namangan» gaz ta'minoti filiali",
            "«Hududgaz Samarqand» gaz ta'minoti filiali",
            "«Hududgaz Sirdaryo» gaz ta'minoti filiali",
            "«Hududgaz Toshkent» gaz ta'minoti filiali",
            "«Hududgaz Jizzax» gaz ta'minoti filiali",
            "«Hududgaz Surxandaryo» gaz ta'minoti filiali",
        };

        var roadNames = new[]
        {
            "«Hududgaz Toshkent» filiali",
            "«Hududgaz Samarqand» filiali",
            "«Hududgaz Qashqadaryo» filiali",
        };

        await EnsureContractorGroupAsync(db, LogisticsTypes.Railway, railwayNames);
        await EnsureContractorGroupAsync(db, LogisticsTypes.Road, roadNames);
    }

    private static async Task EnsureContractorGroupAsync(AppDbContext db, string logisticsType, IEnumerable<string> names)
    {
        var existing = await db.Contractors
            .Where(c => c.LogisticsType == logisticsType)
            .Select(c => c.Name)
            .ToListAsync();
        var existingSet = existing.ToHashSet(StringComparer.Ordinal);

        var toAdd = names
            .Where(name => !existingSet.Contains(name))
            .Select(name => new Contractor
            {
                Name = name,
                LogisticsType = logisticsType,
                IsSystem = true,
            })
            .ToList();

        if (toAdd.Count == 0) return;

        db.Contractors.AddRange(toAdd);
        await db.SaveChangesAsync();
    }

    private static async Task EnsureContractorDestinationsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "ContractorDestinations" (
                "Id" uuid NOT NULL,
                "ContractorName" character varying(300) NOT NULL,
                "LogisticsType" character varying(20) NOT NULL,
                "StationName" character varying(200) NOT NULL,
                "IsSystem" boolean NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_ContractorDestinations" PRIMARY KEY ("Id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ContractorDestinations_LogisticsType_ContractorName_StationName"
                ON "ContractorDestinations" ("LogisticsType", "ContractorName", "StationName");
            """);
    }

    private static async Task EnsureContractorDestinationsAsync(AppDbContext db)
    {
        var railwayPairs = new (string Contractor, string Station)[]
        {
            ("«Hududgaz Andijon» gaz ta'minoti filiali", "Axtachi"),
            ("«Hududgaz Farg'ona» gaz ta'minoti filiali", "Oltiariq"),
            ("«Hududgaz Namangan» gaz ta'minoti filiali", "Uychi"),
            ("«Hududgaz Namangan» gaz ta'minoti filiali", "To'raqo'rg'on"),
            ("«Hududgaz Samarqand» gaz ta'minoti filiali", "Maroqand"),
            ("«Hududgaz Samarqand» gaz ta'minoti filiali", "Jomboy"),
            ("«Hududgaz Sirdaryo» gaz ta'minoti filiali", "Jomboy"),
            ("«Hududgaz Toshkent» gaz ta'minoti filiali", "Jomboy"),
            ("«Hududgaz Jizzax» gaz ta'minoti filiali", "Jomboy"),
            ("«Hududgaz Surxandaryo» gaz ta'minoti filiali", "Oqjar"),
            ("«Hududgaz Surxandaryo» gaz ta'minoti filiali", "Xayrabod"),
        };

        var roadPairs = new (string Contractor, string Station)[]
        {
            ("«Hududgaz Toshkent» filiali", "Toshkent sh., Chilonzor"),
            ("«Hududgaz Samarqand» filiali", "Samarqand vil., Payariq"),
            ("«Hududgaz Qashqadaryo» filiali", "Qarshi sh., Sanoatchilar"),
        };

        var fromOrders = await (
            from line in db.MonthlyOrderLines
            join order in db.MonthlyOrders on line.MonthlyOrderId equals order.Id
            where line.Contractor != "" && line.DestinationStation != ""
            select new
            {
                order.LogisticsType,
                line.Contractor,
                line.DestinationStation,
            }
        ).Distinct().ToListAsync();

        var pairs = railwayPairs
            .Select(p => (LogisticsTypes.Railway, p.Contractor, p.Station))
            .Concat(roadPairs.Select(p => (LogisticsTypes.Road, p.Contractor, p.Station)))
            .Concat(fromOrders.Select(p => (p.LogisticsType, p.Contractor, p.DestinationStation)));

        await EnsureContractorDestinationGroupAsync(db, pairs);
    }

    private static async Task EnsureContractorDestinationGroupAsync(
        AppDbContext db,
        IEnumerable<(string LogisticsType, string Contractor, string Station)> pairs)
    {
        var existing = await db.ContractorDestinations
            .Select(d => new { d.LogisticsType, d.ContractorName, d.StationName })
            .ToListAsync();
        var existingSet = existing
            .Select(e => $"{e.LogisticsType}|{e.ContractorName}|{e.StationName}")
            .ToHashSet(StringComparer.Ordinal);

        var toAdd = pairs
            .Where(p => !string.IsNullOrWhiteSpace(p.Contractor) && !string.IsNullOrWhiteSpace(p.Station))
            .Where(p => !existingSet.Contains($"{p.LogisticsType}|{p.Contractor}|{p.Station}"))
            .Select(p => new ContractorDestination
            {
                LogisticsType = p.LogisticsType,
                ContractorName = p.Contractor,
                StationName = p.Station,
                IsSystem = true,
            })
            .ToList();

        if (toAdd.Count == 0) return;

        db.ContractorDestinations.AddRange(toAdd);
        await db.SaveChangesAsync();
    }

    private static string? MapLegacyRailwayProductType(string productType) =>
        productType switch
        {
            ProductTypes.Lpg => null,
            ProductTypes.EthylenePolymers => null,
            ProductTypes.AllSulfur => null,
            ProductTypes.GasCondensate => null,
            ProductTypes.Buten1 => null,
            "Suyultirilgan gaz — Propan-butan fraksiyasi" => ProductTypes.Lpg,
            "Suyultirilgan gaz — Texnik propan" => ProductTypes.Lpg,
            "Suyultirilgan gaz — N-buten, izobuten" => ProductTypes.Lpg,
            "Suyultirilgan gaz — Buten-1" => ProductTypes.Buten1,
            "Polietilen" => ProductTypes.EthylenePolymers,
            "Texnik oltingugurt" => ProductTypes.AllSulfur,
            "Poddon" => ProductTypes.Lpg,
            _ when productType.StartsWith("Suyultirilgan gaz — ", StringComparison.Ordinal) => ProductTypes.Lpg,
            _ => null,
        };

    private static MonthlyOrderLine Line(int sort, string contractor, int wagons, string destination) => new()
    {
        SortOrder = sort,
        Contractor = contractor,
        WagonCount = wagons,
        QuantityUnit = OrderQuantityUnits.Wagon,
        DestinationStation = destination,
    };

    private static User CreateUser(string username, string password, string fullName, string role, string department) =>
        new()
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            FullName = fullName,
            Email = $"{username}@etransport.local",
            Role = role,
            Department = department,
            DepartmentShortName = department,
            Position = role,
        };

    private static async Task EnsureUsersTokenVersionColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "TokenVersion" integer NOT NULL DEFAULT 0;
            """);
    }

    private static async Task EnsureUsersAvatarColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "AvatarUrl" text NOT NULL DEFAULT '';
            """);
    }

    private static async Task EnsureEmptyWagonArrivalsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "EmptyWagonArrivals" (
                "Id" uuid NOT NULL,
                "ArrivalNumber" character varying(50) NOT NULL,
                "ArrivalDate" timestamp with time zone NOT NULL,
                "WagonCount" integer NOT NULL,
                "WagonNumbers" text NOT NULL,
                "CisternNumbers" text NOT NULL,
                "ProductType" text NOT NULL,
                "TrackNumber" text NOT NULL,
                "NotifiedDepartments" text NOT NULL,
                "PreparedDepartments" text NOT NULL DEFAULT '',
                "Notes" text NOT NULL,
                "CreatedById" uuid NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_EmptyWagonArrivals" PRIMARY KEY ("Id")
            );
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "PreparedDepartments" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "Stage" text NOT NULL DEFAULT 'KengsoyInspection';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "TareWeight" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "VerifiedWagonNumbers" text NOT NULL DEFAULT '';
        """);
    }

    private static async Task EnsureDailyPlanLinesTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "DailyPlanLines" (
                "Id" uuid NOT NULL,
                "DailyPlanId" uuid NOT NULL,
                "MonthlyOrderLineId" uuid NOT NULL,
                "PlannedWagons" integer NOT NULL,
                "Contractor" character varying(300) NOT NULL DEFAULT '',
                "DestinationStation" character varying(200) NOT NULL DEFAULT '',
                CONSTRAINT "PK_DailyPlanLines" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_DailyPlanLines_DailyPlans_DailyPlanId"
                    FOREIGN KEY ("DailyPlanId") REFERENCES "DailyPlans" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_DailyPlanLines_MonthlyOrderLines_MonthlyOrderLineId"
                    FOREIGN KEY ("MonthlyOrderLineId") REFERENCES "MonthlyOrderLines" ("Id") ON DELETE RESTRICT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_DailyPlanLines_DailyPlanId_MonthlyOrderLineId"
                ON "DailyPlanLines" ("DailyPlanId", "MonthlyOrderLineId");
            CREATE INDEX IF NOT EXISTS "IX_DailyPlanLines_MonthlyOrderLineId"
                ON "DailyPlanLines" ("MonthlyOrderLineId");
        """);
    }

    private static async Task EnsureEmptyWagonLoadingColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "LoadingComment" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "LoadingCompletedByName" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "LoadingCompletedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EconomistNotifiedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "GrossWeight" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "DailyPlanId" uuid NULL;
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "DailyPlanLineId" uuid NULL;
        """);
    }

    private static async Task EnsureEmptyWagonUnitsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "EmptyWagonUnits" (
                "Id" uuid NOT NULL,
                "EmptyWagonArrivalId" uuid NOT NULL,
                "SortOrder" integer NOT NULL DEFAULT 0,
                "WagonNumber" character varying(50) NOT NULL,
                "CisternNumber" character varying(50) NOT NULL DEFAULT '',
                "Status" character varying(40) NOT NULL DEFAULT 'AwaitingTare',
                "TareWeight" character varying(40) NOT NULL DEFAULT '',
                "GrossWeight" character varying(40) NOT NULL DEFAULT '',
                "LoadingComment" text NOT NULL DEFAULT '',
                "LoadingStartedAt" timestamp with time zone NULL,
                "LoadingCompletedAt" timestamp with time zone NULL,
                "LoadingCompletedByName" character varying(200) NOT NULL DEFAULT '',
                "TareWeighedAt" timestamp with time zone NULL,
                "GrossWeighedAt" timestamp with time zone NULL,
                CONSTRAINT "PK_EmptyWagonUnits" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_EmptyWagonUnits_EmptyWagonArrivals_EmptyWagonArrivalId"
                    FOREIGN KEY ("EmptyWagonArrivalId") REFERENCES "EmptyWagonArrivals"("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_EmptyWagonUnits_EmptyWagonArrivalId_WagonNumber"
                ON "EmptyWagonUnits" ("EmptyWagonArrivalId", "WagonNumber");
            CREATE INDEX IF NOT EXISTS "IX_EmptyWagonUnits_Status"
                ON "EmptyWagonUnits" ("Status");
        """);

        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "TareCheckedAt" timestamp with time zone NULL;
        """);

        // Mavjud partiyalardan vagonlarni bir martalik backfill
        try
        {
            var arrivals = await db.EmptyWagonArrivals
                .Include(a => a.Units)
                .ToListAsync();
            var touched = false;
            foreach (var arrival in arrivals)
            {
                if (arrival.Units.Count > 0) continue;
                await EmptyWagonUnitSync.EnsureUnitsAsync(db, arrival);
                touched = true;
            }
            if (touched)
                await db.SaveChangesAsync();
        }
        catch
        {
            // backfill keyingi so‘rovda GetAll orqali bo‘ladi
        }
    }

    private static async Task EnsureLoadingBatchColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonUnits"
            ADD COLUMN IF NOT EXISTS "LoadingBatchNumber" character varying(80) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits"
            ADD COLUMN IF NOT EXISTS "LoadingCompletedByName" character varying(200) NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS "IX_EmptyWagonUnits_LoadingBatchNumber"
            ON "EmptyWagonUnits" ("LoadingBatchNumber");
            """);
    }

    private static async Task BackfillLoadingSignersAsync(AppDbContext db)
    {
        var warehouseName = await db.Users
            .Where(u => u.Role == UserRoles.Warehouse && u.IsActive)
            .OrderBy(u => u.CreatedAt)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync() ?? "TM va XA smena muxandisi";

        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .Where(a => a.Units.Any(u => u.LoadingCompletedAt != null))
            .ToListAsync();

        foreach (var arrival in arrivals)
        {
            foreach (var unit in arrival.Units.Where(u => u.LoadingCompletedAt != null && u.LoadingCompletedByName == ""))
                unit.LoadingCompletedByName = warehouseName;

            var latest = arrival.Units
                .Where(u => u.LoadingCompletedAt != null)
                .OrderByDescending(u => u.LoadingCompletedAt)
                .First();
            arrival.LoadingCompletedAt ??= latest.LoadingCompletedAt;
            if (string.IsNullOrWhiteSpace(arrival.LoadingCompletedByName))
                arrival.LoadingCompletedByName = latest.LoadingCompletedByName;
        }

        await db.SaveChangesAsync();
    }

    private static async Task EnsureEmptyWagonSealColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealNumber" character varying(80) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ALTER COLUMN "SealNumber" TYPE text;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "IsManualSeal" boolean NOT NULL DEFAULT false;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealEnteredToUngAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealConfirmedByScaleAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealConfirmedByScaleName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealConfirmedBySecurityAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealConfirmedBySecurityName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealConfirmedByEconomistAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "SealConfirmedByEconomistName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "ScaleExitedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "WagonType" character varying(40) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "ProductType" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "PlatformTareWeight" character varying(40) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "ContainerTareWeights" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ALTER COLUMN "CisternNumber" TYPE character varying(200);
        """);
    }

    private static async Task EnsureLoadingRegistrySignerColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "PreparedByName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "EconomistApprovedByName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "PermitApprovedByName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "SecurityApprovedByName" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "PermitApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "SecurityApprovedAt" timestamp with time zone NULL;
        """);
    }

    private static async Task EnsureFleetOwnershipColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonUnits"
            ADD COLUMN IF NOT EXISTS "Ownership" character varying(20) NOT NULL DEFAULT 'tashqi';
            """);
    }

    private static async Task EnsureIntakeLoadStateColumnAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "EmptyWagonUnits"
            ADD COLUMN IF NOT EXISTS "IntakeLoadState" character varying(20) NOT NULL DEFAULT 'bosh';
            """);
    }

    private static async Task EnsureCatalogFleetWagonsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "CatalogFleetWagons" (
                "Id" uuid NOT NULL,
                "WagonNumber" character varying(20) NOT NULL,
                "Ownership" character varying(20) NOT NULL DEFAULT 'tashqi',
                "WagonKind" character varying(40) NULL,
                "IsActive" boolean NOT NULL DEFAULT true,
                "Notes" character varying(500) NULL,
                "BuiltAt" timestamp with time zone NULL,
                "LastCapitalRepairAt" timestamp with time zone NULL,
                "LastDepotRepairAt" timestamp with time zone NULL,
                "DaysUntilNextDepotRepair" integer NULL,
                "DestinationStation" character varying(200) NULL,
                "SentAt" timestamp with time zone NULL,
                "DaysInTransit" integer NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                "UpdatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_CatalogFleetWagons" PRIMARY KEY ("Id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogFleetWagons_WagonNumber"
                ON "CatalogFleetWagons" ("WagonNumber");
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "BuiltAt" timestamp with time zone NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "LastCapitalRepairAt" timestamp with time zone NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "LastDepotRepairAt" timestamp with time zone NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "DaysUntilNextDepotRepair" integer NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "DestinationStation" character varying(200) NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "SentAt" timestamp with time zone NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "DaysInTransit" integer NULL;
            ALTER TABLE "CatalogFleetWagons" ADD COLUMN IF NOT EXISTS "Serviceability" character varying(20) NULL;
            """);
    }

    private static async Task EnsureCatalogContainersTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "CatalogContainers" (
                "Id" uuid NOT NULL,
                "ContainerNumber" character varying(80) NOT NULL,
                "BuiltAt" timestamp with time zone NULL,
                "NextInspectionAt" timestamp with time zone NULL,
                "DaysUntilNextInspection" integer NULL,
                "DestinationStation" character varying(200) NULL,
                "SentAt" timestamp with time zone NULL,
                "DaysInTransit" integer NULL,
                "Notes" character varying(500) NULL,
                "Serviceability" character varying(20) NULL,
                "IsActive" boolean NOT NULL DEFAULT true,
                "CreatedAt" timestamp with time zone NOT NULL,
                "UpdatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_CatalogContainers" PRIMARY KEY ("Id")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CatalogContainers_ContainerNumber"
                ON "CatalogContainers" ("ContainerNumber");
            ALTER TABLE "CatalogContainers" ADD COLUMN IF NOT EXISTS "Serviceability" character varying(20) NULL;
            """);
    }

    private static async Task EnsureLoadingRegistriesTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "LoadingRegistries" (
                "Id" uuid NOT NULL,
                "EmptyWagonArrivalId" uuid NOT NULL,
                "RegistryNumber" character varying(100) NOT NULL,
                "IsApprovedByEconomist" boolean NOT NULL DEFAULT false,
                "EconomistApprovedAt" timestamp with time zone NULL,
                "IsEconomistApprovedWithPermit" boolean NOT NULL DEFAULT false,
                "EconomistApprovedWithPermitAt" timestamp with time zone NULL,
                "IsEconomistApprovedWithSecurity" boolean NOT NULL DEFAULT false,
                "EconomistApprovedWithSecurityAt" timestamp with time zone NULL,
                "IsApprovedByPermit" boolean NOT NULL DEFAULT false,
                "IsApprovedBySecurity" boolean NOT NULL DEFAULT false,
                "SecurityCheckResult" text NOT NULL DEFAULT '',
                "IsSentToOneC" boolean NOT NULL DEFAULT false,
                "IsSentToENakl" boolean NOT NULL DEFAULT false,
                "SentToOneCAt" timestamp with time zone NULL,
                "SentToENaklAt" timestamp with time zone NULL,
                "HandoverToMachinistAt" timestamp with time zone NULL,
                "ExitedToKengsoyAt" timestamp with time zone NULL,
                "PreparedById" uuid NOT NULL,
                "PreparedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_LoadingRegistries" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_LoadingRegistries_EmptyWagonArrivals_EmptyWagonArrivalId"
                    FOREIGN KEY ("EmptyWagonArrivalId") REFERENCES "EmptyWagonArrivals"("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_LoadingRegistries_RegistryNumber"
                ON "LoadingRegistries" ("RegistryNumber");
            CREATE INDEX IF NOT EXISTS "IX_LoadingRegistries_EmptyWagonArrivalId"
                ON "LoadingRegistries" ("EmptyWagonArrivalId");
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "IsApprovedByEconomist" boolean NOT NULL DEFAULT false;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "EconomistApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "IsEconomistApprovedWithPermit" boolean NOT NULL DEFAULT false;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "EconomistApprovedWithPermitAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "IsEconomistApprovedWithSecurity" boolean NOT NULL DEFAULT false;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "EconomistApprovedWithSecurityAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "PermitCheckResult" text NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "LastRevisionComment" text NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "RevisedAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "ExitedToKengsoyAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "MonthlyOrderId" uuid NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "MonthlyOrderLineId" uuid NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "OrderNumber" character varying(100) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "ContractNumber" character varying(150) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "ContractorName" character varying(300) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "DestinationStation" character varying(200) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "WagonRoutesJson" text NOT NULL DEFAULT '[]';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "IsApprovedByShiftSupervisor" boolean NOT NULL DEFAULT false;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "ShiftSupervisorApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "ShiftSupervisorApprovedByName" character varying(200) NOT NULL DEFAULT '';

            -- Yangi ikki bosqichli chiqish modeliga o'tish:
            -- eski 1C demo reyestrlari avvaldan yakunlangan, joriy EWA reyestri esa
            -- iqtisodchidan Temir yo'lga topshirilgan navbat sifatida qayta ochiladi.
            UPDATE "LoadingRegistries"
            SET "ExitedToKengsoyAt" = "HandoverToMachinistAt"
            WHERE "ExitedToKengsoyAt" IS NULL
              AND "HandoverToMachinistAt" IS NOT NULL
              AND "RegistryNumber" LIKE 'YX-1C-%';

            -- A previous departure must not close a later entry of the same wagon.
            WITH departed_visits AS (
             SELECT DISTINCT
               COALESCE(NULLIF(route->>'SourceArrivalId',''), NULLIF(route->>'sourceArrivalId',''), r."EmptyWagonArrivalId"::text) AS arrival_id,
               trim(COALESCE(route->>'WagonNumber',route->>'wagonNumber')) AS wagon_number
             FROM "LoadingRegistries" r
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(r."WagonRoutesJson",''),'[]')::jsonb) route
             WHERE r."ExitedToKengsoyAt" IS NOT NULL
            ), affected AS (
             SELECT u."Id"
             FROM "EmptyWagonUnits" u JOIN "EmptyWagonArrivals" a ON a."Id"=u."EmptyWagonArrivalId"
             WHERE u."ScaleExitedAt" IS NOT NULL
               AND a."ArrivalNumber" NOT LIKE '1C-%'
               AND a."Stage" NOT IN ('Exited','Cancelled')
               AND EXISTS (
                 SELECT 1 FROM departed_visits d JOIN "EmptyWagonArrivals" old ON old."Id"::text=d.arrival_id
                 WHERE d.wagon_number=trim(u."WagonNumber") AND old."Id"<>a."Id" AND old."CreatedAt"<a."CreatedAt"
               )
               AND NOT EXISTS (
                 SELECT 1 FROM departed_visits d WHERE d.arrival_id=u."EmptyWagonArrivalId"::text AND d.wagon_number=trim(u."WagonNumber")
               )
            )
            UPDATE "EmptyWagonUnits" u SET "ScaleExitedAt"=NULL FROM affected f WHERE u."Id"=f."Id";

            -- Weights, seals and approvals come only from operational records or 1C.
            -- Never synthesize them or advance a party during schema initialization.
        """);
    }

    private static async Task RestoreHandedOverParkLocationsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            UPDATE "CatalogFleetWagons" AS w
            SET "DestinationStation" = 'ShGKM', "DaysInTransit" = 0, "UpdatedAt" = NOW()
            WHERE w."WagonNumber" IN (
                SELECT regexp_replace(route->>'WagonNumber', '\D', '', 'g')
                FROM "LoadingRegistries" AS r,
                     jsonb_array_elements(COALESCE(NULLIF(r."WagonRoutesJson", ''), '[]')::jsonb) AS route
                WHERE r."HandoverToMachinistAt" IS NOT NULL
                  AND r."ExitedToKengsoyAt" IS NULL
            );
        """);
    }

    private static async Task EnsureOrderAttachmentsTableAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "OrderAttachments" (
                "Id" uuid NOT NULL,
                "MonthlyOrderId" uuid NOT NULL,
                "FileName" character varying(260) NOT NULL,
                "ContentType" character varying(120) NOT NULL,
                "SizeBytes" bigint NOT NULL,
                "ObjectKey" character varying(500) NOT NULL,
                "UploadedById" uuid NOT NULL,
                "UploadedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_OrderAttachments" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_OrderAttachments_MonthlyOrders_MonthlyOrderId"
                    FOREIGN KEY ("MonthlyOrderId") REFERENCES "MonthlyOrders"("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_OrderAttachments_Users_UploadedById"
                    FOREIGN KEY ("UploadedById") REFERENCES "Users"("Id") ON DELETE RESTRICT
            );
            CREATE INDEX IF NOT EXISTS "IX_OrderAttachments_MonthlyOrderId"
                ON "OrderAttachments" ("MonthlyOrderId");
            CREATE INDEX IF NOT EXISTS "IX_OrderAttachments_UploadedById"
                ON "OrderAttachments" ("UploadedById");
        """);
    }

    private static async Task EnsureOrderFulfillmentAndDefectActsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "MonthlyOrderLines" ADD COLUMN IF NOT EXISTS "FulfilledWagonCount" integer NOT NULL DEFAULT 0;
            ALTER TABLE "MonthlyOrderLines" ADD COLUMN IF NOT EXISTS "FulfilledNetWeight" numeric(18,3) NOT NULL DEFAULT 0;
            ALTER TABLE "MonthlyOrderLines" ADD COLUMN IF NOT EXISTS "ContractNumber" character varying(100) NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrderLines" ADD COLUMN IF NOT EXISTS "ProductGrade" character varying(100) NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "OrderDeductedWagons" integer NOT NULL DEFAULT 0;
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "OrderDeductedNetWeight" numeric(18,3) NOT NULL DEFAULT 0;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActNumber" character varying(40) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActType" character varying(40) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActFileName" character varying(260) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActContentType" character varying(120) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActSizeBytes" bigint NOT NULL DEFAULT 0;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActObjectKey" character varying(500) NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActUploadedAt" timestamp with time zone NULL;
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActUploadedByName" character varying(200) NOT NULL DEFAULT '';
        """);
    }

    public static async Task EnsureDepartedUnitsExitedAsync(AppDbContext db)
    {
        // 1. Yuklash reyestrida Kengsoyga chiqib ketgan vagonlarning ScaleExitedAt ustunini to'ldirish
        var exitedRegistries = await db.LoadingRegistries
            .Where(r => r.ExitedToKengsoyAt != null)
            .Select(r => new { r.ExitedToKengsoyAt, r.WagonRoutesJson, r.EmptyWagonArrivalId })
            .ToListAsync();

        // MUHIM: Vagon qayta-qayta kelishi mumkin (masalan bir oyda 2-3 marta).
        // Shuning uchun chiqish faqat o'sha partiya (EmptyWagonArrivalId) bilan birgalikda tekshiriladi!
        // Eski partiyadagi chiqish sanasi yangi partiyadagi vagon ustiga aslo yozilmasligi shart.
        var exitedWagonMap = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in exitedRegistries)
        {
            if (!r.ExitedToKengsoyAt.HasValue || string.IsNullOrEmpty(r.WagonRoutesJson)) continue;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(r.WagonRoutesJson);
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var elem in doc.RootElement.EnumerateArray())
                    {
                        var isDef = elem.TryGetProperty("IsDefective", out var pDef) && pDef.GetBoolean();
                        if (!isDef && elem.TryGetProperty("WagonNumber", out var pNum))
                        {
                            var num = pNum.GetString()?.Trim();
                            if (!string.IsNullOrEmpty(num))
                            {
                                var srcArrival = elem.TryGetProperty("SourceArrivalId", out var pSrc)
                                    ? pSrc.GetString()
                                    : (elem.TryGetProperty("sourceArrivalId", out var pSrc2) ? pSrc2.GetString() : null);
                                var arrivalId = !string.IsNullOrEmpty(srcArrival) ? srcArrival : r.EmptyWagonArrivalId.ToString();
                                var key = $"{arrivalId}:{num}";
                                exitedWagonMap[key] = r.ExitedToKengsoyAt.Value;
                            }
                        }
                    }
                }
            }
            catch { }
        }

        var units = await db.EmptyWagonUnits
            .Include(u => u.Arrival)
            .Where(u => u.ScaleExitedAt == null && u.Status != EmptyWagonUnitStatuses.Returned)
            .ToListAsync();

        foreach (var u in units)
        {
            if (!string.IsNullOrEmpty(u.WagonNumber))
            {
                var key = $"{u.EmptyWagonArrivalId}:{u.WagonNumber.Trim()}";
                if (exitedWagonMap.TryGetValue(key, out var exitDate))
                {
                    if (u.Arrival == null || exitDate >= u.Arrival.CreatedAt)
                    {
                        u.ScaleExitedAt = exitDate;
                    }
                }
            }
        }

        // 2. Barcha vagonlari chiqib ketgan partiyalarni Stage = 'Exited' qilish
        var arrivals = await db.EmptyWagonArrivals
            .Include(a => a.Units)
            .Where(a => a.Stage != "Exited" && a.Stage != "Cancelled")
            .ToListAsync();

        foreach (var a in arrivals)
        {
            if (a.Units != null && a.Units.Count > 0 &&
                a.Units.All(u => u.ScaleExitedAt.HasValue || u.Status == EmptyWagonUnitStatuses.Returned))
            {
                a.Stage = "Exited";
            }
        }

        await db.SaveChangesAsync();
    }

    public static async Task EnsureMonthlyPlansAsync(AppDbContext db)
    {
        var pePlan = await db.MonthlyPlans.FirstOrDefaultAsync(p => p.Year == 2026 && p.Month == 9 && p.ProductType.Contains("polietilen"));
        if (pePlan != null)
        {
            pePlan.PlanWagons = 4;
            pePlan.PlanTons = 200.00m;
            pePlan.Notes = "2026-yil sentabr oylik reja (Buyurtmalar bo'yicha)";
        }

        var lpgPlan = await db.MonthlyPlans.FirstOrDefaultAsync(p => p.Year == 2026 && p.Month == 9 && p.ProductType.Contains("suyultirilgan"));
        if (lpgPlan != null)
        {
            lpgPlan.PlanWagons = 339;
            lpgPlan.PlanTons = 10847.60m;
            lpgPlan.Notes = "2026-yil sentabr oylik reja (Buyurtmalar bo'yicha)";
        }

        var gkPlan = await db.MonthlyPlans.FirstOrDefaultAsync(p => p.Year == 2026 && p.Month == 9 && p.ProductType.Contains("kondensat"));
        if (gkPlan != null)
        {
            gkPlan.PlanWagons = 170;
            gkPlan.PlanTons = 8500.00m;
            gkPlan.Notes = "2026-yil sentabr oylik reja (Buyurtmalar bo'yicha)";
        }

        await db.SaveChangesAsync();
    }

    private static async Task RebuildOrderFulfillmentAsync(AppDbContext db)
    {
        var lines = await db.MonthlyOrderLines.ToListAsync();
        foreach (var line in lines)
        {
            line.FulfilledWagonCount = 0;
            line.FulfilledNetWeight = 0;
        }

        var allUnits = await db.EmptyWagonUnits.ToListAsync();
        var unitsByArrivalAndNumber = allUnits
            .ToLookup(u => (u.EmptyWagonArrivalId, (u.WagonNumber ?? "").Trim().ToUpperInvariant()));
        var unitsByNumber = allUnits
            .ToLookup(u => (u.WagonNumber ?? "").Trim().ToUpperInvariant());

        var registries = await db.LoadingRegistries
            .Include(r => r.EmptyWagonArrival)!.ThenInclude(a => a.Units)
            .ToListAsync();
        var linesById = lines.ToDictionary(x => x.Id);
        foreach (var registry in registries)
        {
            List<LoadingRegistryWagonRouteDto> routes;
            try
            {
                routes = JsonSerializer.Deserialize<List<LoadingRegistryWagonRouteDto>>(registry.WagonRoutesJson) ?? [];
            }
            catch
            {
                routes = [];
            }

            var fulfilled = routes.Where(x => !x.IsDefective && linesById.ContainsKey(x.MonthlyOrderLineId)).ToList();
            registry.OrderDeductedWagons = fulfilled.Count;
            registry.OrderDeductedNetWeight = 0;
            foreach (var route in fulfilled)
            {
                var line = linesById[route.MonthlyOrderLineId];
                line.FulfilledWagonCount++;

                var wKey = (route.WagonNumber ?? "").Trim().ToUpperInvariant();
                EmptyWagonUnit? unit = null;
                if (route.SourceArrivalId.HasValue)
                    unit = unitsByArrivalAndNumber[(route.SourceArrivalId.Value, wKey)].FirstOrDefault();
                if (unit == null && registry.EmptyWagonArrivalId != Guid.Empty)
                    unit = unitsByArrivalAndNumber[(registry.EmptyWagonArrivalId, wKey)].FirstOrDefault();
                if (unit == null)
                    unit = unitsByNumber[wKey].FirstOrDefault();

                decimal net = 0;
                if (unit != null && EmptyWagonUnitSync.TryParseWeight(EmptyWagonUnitSync.FormatNetto(unit.TareWeight, unit.GrossWeight), out var parsedNet))
                {
                    net = parsedNet;
                }
                else if (route.NetWeight > 0)
                {
                    net = route.NetWeight;
                }

                net = Math.Max(0, net);
                line.FulfilledNetWeight += net;
                registry.OrderDeductedNetWeight += net;
            }
        }
        var orders = await db.MonthlyOrders.Include(o => o.Lines)
            .Where(o => o.Status == OrderStatus.Active || o.Status == OrderStatus.Completed)
            .ToListAsync();
        foreach (var order in orders)
            OrderFulfillment.RefreshStatus(order);
        await db.SaveChangesAsync();
    }

    private static async Task EnsureQrLinkColumnsAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "QrFinalFileHash" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitQrFinalFileHash" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActQrFinalFileHash" text NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "QrGlobalId" text NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "QrVerificationUrl" text NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "QrCodeBase64" text NOT NULL DEFAULT '';
            ALTER TABLE "LoadingRegistries" ADD COLUMN IF NOT EXISTS "QrRegisteredAt" timestamp with time zone NULL;

            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitQrGlobalId" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitQrVerificationUrl" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitQrCodeBase64" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonArrivals" ADD COLUMN IF NOT EXISTS "EntryPermitQrRegisteredAt" timestamp with time zone NULL;

            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActQrGlobalId" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActQrVerificationUrl" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActQrCodeBase64" text NOT NULL DEFAULT '';
            ALTER TABLE "EmptyWagonUnits" ADD COLUMN IF NOT EXISTS "DefectActQrRegisteredAt" timestamp with time zone NULL;

            ALTER TABLE "MonthlyOrders" ADD COLUMN IF NOT EXISTS "QrGlobalId" text NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrders" ADD COLUMN IF NOT EXISTS "QrVerificationUrl" text NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrders" ADD COLUMN IF NOT EXISTS "QrCodeBase64" text NOT NULL DEFAULT '';
            ALTER TABLE "MonthlyOrders" ADD COLUMN IF NOT EXISTS "QrRegisteredAt" timestamp with time zone NULL;
            ALTER TABLE "MonthlyOrders" ADD COLUMN IF NOT EXISTS "ProductGrade" character varying(100) NOT NULL DEFAULT '';

            UPDATE "LoadingRegistries" SET "QrVerificationUrl" = REPLACE("QrVerificationUrl", 'https://qrlink.uz', 'https://qrlink.sgcc.uz') WHERE "QrVerificationUrl" LIKE '%qrlink.uz%';
            UPDATE "EmptyWagonArrivals" SET "EntryPermitQrVerificationUrl" = REPLACE("EntryPermitQrVerificationUrl", 'https://qrlink.uz', 'https://qrlink.sgcc.uz') WHERE "EntryPermitQrVerificationUrl" LIKE '%qrlink.uz%';
            UPDATE "EmptyWagonUnits" SET "DefectActQrVerificationUrl" = REPLACE("DefectActQrVerificationUrl", 'https://qrlink.uz', 'https://qrlink.sgcc.uz') WHERE "DefectActQrVerificationUrl" LIKE '%qrlink.uz%';
            UPDATE "MonthlyOrders" SET "QrVerificationUrl" = REPLACE("QrVerificationUrl", 'https://qrlink.uz', 'https://qrlink.sgcc.uz') WHERE "QrVerificationUrl" LIKE '%qrlink.uz%';
        """);
    }

    private static async Task EnsureRecycleBinAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "RecycleBinItems" (
                "Id" uuid NOT NULL PRIMARY KEY,
                "EntityType" character varying(100) NOT NULL,
                "EntityId" uuid NOT NULL,
                "Title" character varying(300) NOT NULL,
                "Category" character varying(50) NOT NULL,
                "RelatedNumber" character varying(100) NOT NULL,
                "FileName" character varying(260) NOT NULL DEFAULT '',
                "ContentType" character varying(100) NOT NULL DEFAULT '',
                "SizeBytes" bigint NOT NULL DEFAULT 0,
                "ObjectKey" character varying(500) NOT NULL DEFAULT '',
                "DeletedById" uuid NOT NULL,
                "DeletedByName" character varying(200) NOT NULL DEFAULT '',
                "DeletedByRole" character varying(50) NOT NULL DEFAULT '',
                "DeletedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
                "DeleteReason" character varying(500) NOT NULL DEFAULT '',
                "PayloadJson" text NOT NULL DEFAULT '',
                "ExpiresAt" timestamp with time zone NOT NULL,
                "IsRestored" boolean NOT NULL DEFAULT FALSE,
                "RestoredAt" timestamp with time zone NULL,
                "RestoredByName" character varying(200) NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS "IX_RecycleBinItems_EntityType" ON "RecycleBinItems" ("EntityType");
            CREATE INDEX IF NOT EXISTS "IX_RecycleBinItems_Category" ON "RecycleBinItems" ("Category");
            CREATE INDEX IF NOT EXISTS "IX_RecycleBinItems_DeletedAt" ON "RecycleBinItems" ("DeletedAt");
            CREATE INDEX IF NOT EXISTS "IX_RecycleBinItems_ExpiresAt" ON "RecycleBinItems" ("ExpiresAt");
            CREATE INDEX IF NOT EXISTS "IX_RecycleBinItems_IsRestored" ON "RecycleBinItems" ("IsRestored");
        """);
    }
}
