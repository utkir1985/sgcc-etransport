using ETransport.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<MonthlyOrder> MonthlyOrders => Set<MonthlyOrder>();
    public DbSet<MonthlyOrderLine> MonthlyOrderLines => Set<MonthlyOrderLine>();
    public DbSet<OrderAttachment> OrderAttachments => Set<OrderAttachment>();
    public DbSet<DailyPlan> DailyPlans => Set<DailyPlan>();
    public DbSet<DailyPlanLine> DailyPlanLines => Set<DailyPlanLine>();
    public DbSet<Shipment> Shipments => Set<Shipment>();
    public DbSet<ShipmentStatusHistory> ShipmentStatusHistories => Set<ShipmentStatusHistory>();
    public DbSet<Wagon> Wagons => Set<Wagon>();
    public DbSet<WeighingRecord> WeighingRecords => Set<WeighingRecord>();
    public DbSet<DispatchJournal> DispatchJournals => Set<DispatchJournal>();
    public DbSet<ShippingRegistry> ShippingRegistries => Set<ShippingRegistry>();
    public DbSet<LoadingRegistry> LoadingRegistries => Set<LoadingRegistry>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Contractor> Contractors => Set<Contractor>();
    public DbSet<ContractorDestination> ContractorDestinations => Set<ContractorDestination>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<CatalogProduct> CatalogProducts => Set<CatalogProduct>();
    public DbSet<CatalogWagonType> CatalogWagonTypes => Set<CatalogWagonType>();
    public DbSet<CatalogFleetWagon> CatalogFleetWagons => Set<CatalogFleetWagon>();
    public DbSet<CatalogContainer> CatalogContainers => Set<CatalogContainer>();
    public DbSet<CatalogStation> CatalogStations => Set<CatalogStation>();
    public DbSet<EmptyWagonArrival> EmptyWagonArrivals => Set<EmptyWagonArrival>();
    public DbSet<EmptyWagonUnit> EmptyWagonUnits => Set<EmptyWagonUnit>();
    public DbSet<RecycleBinItem> RecycleBinItems => Set<RecycleBinItem>();
    public DbSet<MonthlyPlan> MonthlyPlans => Set<MonthlyPlan>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Username).HasMaxLength(100);
            e.Property(u => u.FullName).HasMaxLength(200);
            e.Property(u => u.Email).HasMaxLength(200);
            e.Property(u => u.Role).HasMaxLength(50);
            e.Property(u => u.Department).HasMaxLength(250);
            e.Property(u => u.DepartmentShortName).HasMaxLength(100);
            e.Property(u => u.Position).HasMaxLength(250);
            e.Property(u => u.AvatarUrl).HasColumnType("text");
        });

        modelBuilder.Entity<MonthlyOrder>(e =>
        {
            e.HasIndex(o => o.OrderNumber).IsUnique();
            e.Property(o => o.LogisticsType).HasMaxLength(20);
            e.HasOne(o => o.CreatedBy).WithMany().HasForeignKey(o => o.CreatedById);
            e.HasOne(o => o.SubmittedBy).WithMany().HasForeignKey(o => o.SubmittedById);
            e.HasOne(o => o.ApprovedByAccounting).WithMany().HasForeignKey(o => o.ApprovedByAccountingId);
            e.HasOne(o => o.SubmittedToDispatchBy).WithMany().HasForeignKey(o => o.SubmittedToDispatchById);
            e.HasOne(o => o.ApprovedByDispatch).WithMany().HasForeignKey(o => o.ApprovedByDispatchId);
            e.Property(o => o.AccountingApproverName).HasMaxLength(200);
            e.Property(o => o.MarketingApproverName).HasMaxLength(200);
            e.Property(o => o.DeputyApproverName).HasMaxLength(200);
            e.Property(o => o.DispatchApproverName).HasMaxLength(200);
            e.HasOne(o => o.ApprovedByMarketing).WithMany().HasForeignKey(o => o.ApprovedByMarketingId);
        });

        modelBuilder.Entity<OrderAttachment>(e =>
        {
            e.HasOne(a => a.MonthlyOrder).WithMany(o => o.Attachments).HasForeignKey(a => a.MonthlyOrderId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.UploadedBy).WithMany().HasForeignKey(a => a.UploadedById)
                .OnDelete(DeleteBehavior.Restrict);
            e.Property(a => a.FileName).HasMaxLength(260);
            e.Property(a => a.ContentType).HasMaxLength(120);
            e.Property(a => a.ObjectKey).HasMaxLength(500);
        });

        modelBuilder.Entity<MonthlyOrderLine>(e =>
        {
            e.HasOne(l => l.MonthlyOrder).WithMany(o => o.Lines).HasForeignKey(l => l.MonthlyOrderId);
            e.Property(l => l.Contractor).HasMaxLength(300);
            e.Property(l => l.DestinationStation).HasMaxLength(200);
            e.Property(l => l.WagonNumbers).HasMaxLength(500);
            e.Property(l => l.QuantityUnit).HasMaxLength(20);
            e.Property(l => l.ContractNumber).HasMaxLength(100);
            e.Property(l => l.ProductGrade).HasMaxLength(100);
            e.Property(l => l.CustomerOrderNumber).HasMaxLength(100);
            e.Property(l => l.AccountingStatus).HasMaxLength(30);
            e.Property(l => l.FulfilledNetWeight).HasPrecision(18, 3);
        });

        modelBuilder.Entity<DailyPlan>(e =>
        {
            e.HasIndex(p => p.PlanNumber).IsUnique();
            e.Property(p => p.PlannedAmount).HasPrecision(18, 2);
            e.HasOne(p => p.MonthlyOrder).WithMany(o => o.DailyPlans).HasForeignKey(p => p.MonthlyOrderId);
            e.HasOne(p => p.CreatedBy).WithMany().HasForeignKey(p => p.CreatedById);
        });

        modelBuilder.Entity<DailyPlanLine>(e =>
        {
            e.Property(l => l.Contractor).HasMaxLength(300);
            e.Property(l => l.DestinationStation).HasMaxLength(200);
            e.HasOne(l => l.DailyPlan).WithMany(p => p.Lines).HasForeignKey(l => l.DailyPlanId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(l => l.MonthlyOrderLine).WithMany().HasForeignKey(l => l.MonthlyOrderLineId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(l => new { l.DailyPlanId, l.MonthlyOrderLineId }).IsUnique();
        });

        modelBuilder.Entity<Shipment>(e =>
        {
            e.HasIndex(s => s.ShipmentNumber).IsUnique();
            e.Property(s => s.LogisticsType).HasMaxLength(20);
            e.HasOne(s => s.DailyPlan).WithMany(p => p.Shipments).HasForeignKey(s => s.DailyPlanId);
        });

        modelBuilder.Entity<Wagon>(e =>
        {
            e.HasOne(w => w.Shipment).WithMany(s => s.Wagons).HasForeignKey(w => w.ShipmentId);
            e.HasOne(w => w.WeighingRecord).WithOne(r => r.Wagon).HasForeignKey<WeighingRecord>(r => r.WagonId);
        });

        modelBuilder.Entity<WeighingRecord>(e =>
        {
            e.Property(w => w.TareWeight).HasPrecision(18, 3);
            e.Property(w => w.GrossWeight).HasPrecision(18, 3);
            e.Ignore(w => w.NetWeight);
        });

        modelBuilder.Entity<ShippingRegistry>(e =>
        {
            e.HasIndex(r => r.RegistryNumber).IsUnique();
            e.HasOne(r => r.Shipment).WithMany().HasForeignKey(r => r.ShipmentId);
        });

        modelBuilder.Entity<EmptyWagonArrival>(e =>
        {
            e.Property(a => a.EntryPermitNumber).HasMaxLength(80);
            e.Property(a => a.EntryPermitShiftApprovedByName).HasMaxLength(200);
            e.Property(a => a.EntryPermitPermitApprovedByName).HasMaxLength(200);
            e.Property(a => a.EntryPermitSecurityApprovedByName).HasMaxLength(200);
            e.HasOne(a => a.CreatedBy).WithMany().HasForeignKey(a => a.CreatedById);
            e.HasOne(a => a.DailyPlan).WithMany().HasForeignKey(a => a.DailyPlanId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(a => a.DailyPlanLine).WithMany().HasForeignKey(a => a.DailyPlanLineId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(a => a.Units).WithOne(u => u.Arrival!).HasForeignKey(u => u.EmptyWagonArrivalId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CatalogFleetWagon>(e =>
        {
            e.Property(w => w.WagonNumber).HasMaxLength(20);
            e.Property(w => w.Ownership).HasMaxLength(20);
            e.Property(w => w.WagonKind).HasMaxLength(40);
            e.Property(w => w.Notes).HasMaxLength(500);
            e.Property(w => w.DestinationStation).HasMaxLength(200);
            e.HasIndex(w => w.WagonNumber).IsUnique();
        });

        modelBuilder.Entity<CatalogContainer>(e =>
        {
            e.Property(c => c.ContainerNumber).HasMaxLength(80);
            e.Property(c => c.DestinationStation).HasMaxLength(200);
            e.Property(c => c.Notes).HasMaxLength(500);
            e.HasIndex(c => c.ContainerNumber).IsUnique();
        });

        modelBuilder.Entity<EmptyWagonUnit>(e =>
        {
            e.Property(u => u.WagonNumber).HasMaxLength(50);
            e.Property(u => u.CisternNumber).HasMaxLength(200);
            e.Property(u => u.WagonType).HasMaxLength(40);
            e.Property(u => u.Ownership).HasMaxLength(20);
            e.Property(u => u.ProductType).HasMaxLength(200);
            e.Property(u => u.Status).HasMaxLength(40);
            e.Property(u => u.TareWeight).HasMaxLength(40);
            e.Property(u => u.PlatformTareWeight).HasMaxLength(40);
            e.Property(u => u.ContainerTareWeights).HasColumnType("text");
            e.Property(u => u.GrossWeight).HasMaxLength(40);
            e.Property(u => u.LoadingBatchNumber).HasMaxLength(80);
            e.Property(u => u.LoadingCompletedByName).HasMaxLength(200);
            e.Property(u => u.DefectActNumber).HasMaxLength(40);
            e.Property(u => u.DefectActType).HasMaxLength(40);
            e.Property(u => u.DefectActFileName).HasMaxLength(260);
            e.Property(u => u.DefectActContentType).HasMaxLength(120);
            e.Property(u => u.DefectActObjectKey).HasMaxLength(500);
            e.Property(u => u.DefectActUploadedByName).HasMaxLength(200);
            e.Property(u => u.SealNumber).HasColumnType("text").IsConcurrencyToken();
            e.Property(u => u.SealConfirmedByScaleName).HasMaxLength(200);
            e.Property(u => u.SealConfirmedBySecurityName).HasMaxLength(200);
            e.Property(u => u.SealConfirmedByEconomistName).HasMaxLength(200);
            e.HasIndex(u => new { u.EmptyWagonArrivalId, u.WagonNumber }).IsUnique();
        });

        modelBuilder.Entity<LoadingRegistry>(e =>
        {
            e.HasIndex(r => r.RegistryNumber).IsUnique();
            e.Property(r => r.PreparedByName).HasMaxLength(200);
            e.Property(r => r.EconomistApprovedByName).HasMaxLength(200);
            e.Property(r => r.PermitApprovedByName).HasMaxLength(200);
            e.Property(r => r.SecurityApprovedByName).HasMaxLength(200);
            e.Property(r => r.ShiftSupervisorApprovedByName).HasMaxLength(200);
            e.Property(r => r.ExitedToKengsoyByName).HasMaxLength(200);
            e.Property(r => r.OrderNumber).HasMaxLength(100);
            e.Property(r => r.ContractNumber).HasMaxLength(150);
            e.Property(r => r.ContractorName).HasMaxLength(300);
            e.Property(r => r.DestinationStation).HasMaxLength(200);
            e.Property(r => r.WagonRoutesJson).HasColumnType("text");
            e.Property(r => r.OrderDeductedNetWeight).HasPrecision(18, 3);
            e.HasOne(r => r.EmptyWagonArrival).WithMany().HasForeignKey(r => r.EmptyWagonArrivalId);
        });

        modelBuilder.Entity<DispatchJournal>(e =>
        {
            e.HasOne(j => j.Shipment).WithMany().HasForeignKey(j => j.ShipmentId);
        });

        modelBuilder.Entity<Contractor>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(300);
            e.Property(c => c.LogisticsType).HasMaxLength(20);
            e.HasIndex(c => new { c.LogisticsType, c.Name }).IsUnique();
        });

        modelBuilder.Entity<ContractorDestination>(e =>
        {
            e.Property(d => d.ContractorName).HasMaxLength(300);
            e.Property(d => d.LogisticsType).HasMaxLength(20);
            e.Property(d => d.StationName).HasMaxLength(200);
            e.HasIndex(d => new { d.LogisticsType, d.ContractorName, d.StationName }).IsUnique();
        });

        modelBuilder.Entity<SystemSetting>(e =>
        {
            e.HasKey(s => s.Key);
            e.Property(s => s.Key).HasMaxLength(100);
        });

        modelBuilder.Entity<CatalogProduct>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(300);
            e.Property(p => p.LogisticsType).HasMaxLength(20);
            e.Property(p => p.OrderPrefix).HasMaxLength(10);
            e.HasIndex(p => new { p.LogisticsType, p.Name }).IsUnique();
            e.HasIndex(p => p.OrderPrefix);
        });

        modelBuilder.Entity<AuditLog>(e =>
        {
            e.Property(a => a.Username).HasMaxLength(100);
            e.Property(a => a.UserFullName).HasMaxLength(200);
            e.Property(a => a.UserRole).HasMaxLength(50);
            e.Property(a => a.UserPosition).HasMaxLength(200);
            e.Property(a => a.UserDepartment).HasMaxLength(200);
            e.Property(a => a.IpAddress).HasMaxLength(50);
            e.Property(a => a.UserAgent).HasMaxLength(500);
            e.Property(a => a.Action).HasMaxLength(100);
            e.Property(a => a.Category).HasMaxLength(50);
            e.Property(a => a.Status).HasMaxLength(20);
            e.Property(a => a.EntityType).HasMaxLength(100);
            e.Property(a => a.EntityId).HasMaxLength(100);
            e.Property(a => a.Details).HasColumnType("text");
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.UserId);
            e.HasIndex(a => a.Username);
            e.HasIndex(a => a.Category);
            e.HasIndex(a => a.Action);
            e.HasIndex(a => a.IpAddress);
        });

        modelBuilder.Entity<RecycleBinItem>(e =>
        {
            e.Property(r => r.EntityType).HasMaxLength(100);
            e.Property(r => r.Title).HasMaxLength(300);
            e.Property(r => r.Category).HasMaxLength(50);
            e.Property(r => r.RelatedNumber).HasMaxLength(100);
            e.Property(r => r.FileName).HasMaxLength(260);
            e.Property(r => r.ContentType).HasMaxLength(100);
            e.Property(r => r.ObjectKey).HasMaxLength(500);
            e.Property(r => r.DeletedByName).HasMaxLength(200);
            e.Property(r => r.DeletedByRole).HasMaxLength(50);
            e.Property(r => r.DeleteReason).HasMaxLength(500);
            e.Property(r => r.PayloadJson).HasColumnType("text");
            e.Property(r => r.RestoredByName).HasMaxLength(200);
            e.HasIndex(r => r.EntityType);
            e.HasIndex(r => r.Category);
            e.HasIndex(r => r.DeletedAt);
            e.HasIndex(r => r.ExpiresAt);
            e.HasIndex(r => r.IsRestored);
        });
    }
}
