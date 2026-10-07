namespace ETransport.Core.Entities;

public class MonthlyPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int Year { get; set; }
    public int Month { get; set; }
    public string FactoryName { get; set; } = "Sho'rtan GKM";
    public string ProductType { get; set; } = string.Empty;
    public decimal PlanTons { get; set; }
    public int PlanWagons { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public Guid? CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public string? CreatedByName { get; set; }
}
