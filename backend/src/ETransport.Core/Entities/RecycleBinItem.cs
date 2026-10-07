namespace ETransport.Core.Entities;

public class RecycleBinItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Ob'ekt turi: OrderAttachment, EmptyWagonUnit, EmptyWagonArrival, MonthlyOrder
    /// </summary>
    public string EntityType { get; set; } = string.Empty;

    /// <summary>
    /// Asl ob'ekt identifikatori
    /// </summary>
    public Guid EntityId { get; set; }

    /// <summary>
    /// Foydalanuvchiga ko‘rinadigan sarlavha (masalan, Fayl nomi yoki Vagon raqami)
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Kategoriya: attachment, wagon, arrival, order
    /// </summary>
    public string Category { get; set; } = "attachment";

    /// <summary>
    /// Aloqador hujjat/partiya/buyurtma raqami (masalan: PE-0926-001, IB-0926-002)
    /// </summary>
    public string RelatedNumber { get; set; } = string.Empty;

    /// <summary>
    /// Fayl nomi (agar fayl bo‘lsa)
    /// </summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>
    /// Fayl MIME turi
    /// </summary>
    public string ContentType { get; set; } = string.Empty;

    /// <summary>
    /// Fayl hajmi (baytlarda)
    /// </summary>
    public long SizeBytes { get; set; }

    /// <summary>
    /// MinIO / disk storage kaliti
    /// </summary>
    public string ObjectKey { get; set; } = string.Empty;

    /// <summary>
    /// O‘chirgan foydalanuvchi ID
    /// </summary>
    public Guid DeletedById { get; set; }

    /// <summary>
    /// O‘chirgan foydalanuvchi F.I.SH
    /// </summary>
    public string DeletedByName { get; set; } = string.Empty;

    /// <summary>
    /// O‘chirgan foydalanuvchi roli
    /// </summary>
    public string DeletedByRole { get; set; } = string.Empty;

    /// <summary>
    /// O‘chirilgan sana va vaqt
    /// </summary>
    public DateTime DeletedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// O‘chirish sababi / izoh
    /// </summary>
    public string DeleteReason { get; set; } = string.Empty;

    /// <summary>
    /// Asl ma'lumotning to‘liq JSON ko‘rinishi (yo‘qotishsiz tiklash uchun)
    /// </summary>
    public string PayloadJson { get; set; } = string.Empty;

    /// <summary>
    /// Saqlash muddati tugash sanasi (default: 30 kun)
    /// </summary>
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(30);

    /// <summary>
    /// Qayta tiklanganlik holati
    /// </summary>
    public bool IsRestored { get; set; } = false;

    public DateTime? RestoredAt { get; set; }

    public string RestoredByName { get; set; } = string.Empty;
}
