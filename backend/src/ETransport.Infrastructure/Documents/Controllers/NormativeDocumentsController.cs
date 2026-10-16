using System.Security.Claims;
using System.Text.Json;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Audit;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Infrastructure.Documents.Controllers;

/// <summary>
/// Normativ hujjatlar: fayl bazada saqlanadi — barcha kompyuter va foydalanuvchilarda bir xil.
/// Huquqlar: normative-docs.read / create / update / delete (Rollar va Huquqlar).
/// </summary>
[ApiController]
[Route("api/normative-docs")]
[Authorize]
public class NormativeDocumentsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    private const long MaxFileBytes = 25L * 1024 * 1024;
    private static readonly string[] Categories = ["law", "railway", "internal", "technical"];

    public record NormativeDocumentDto(
        Guid Id, string Title, string? DocumentNumber, string? DocumentDate, string Category,
        string? Description, string FileName, long FileSize, string MimeType, string? UploadedBy,
        DateTime? CreatedAt, DateTime? UpdatedAt);

    public class NormativeDocumentForm
    {
        public string? Title { get; set; }
        public string? DocumentNumber { get; set; }
        public string? DocumentDate { get; set; }
        public string? Category { get; set; }
        public string? Description { get; set; }
        public IFormFile? File { get; set; }
    }

    [HttpGet]
    [RequirePermission("normative-docs.read")]
    public async Task<IActionResult> List([FromQuery] string? category, [FromQuery] string? search, CancellationToken ct)
    {
        var q = db.NormativeDocuments.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(category) && category != "all") q = q.Where(d => d.Category == category);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(d => d.Title.ToLower().Contains(s)
                || (d.DocumentNumber ?? "").ToLower().Contains(s)
                || (d.Description ?? "").ToLower().Contains(s));
        }
        // Fayl tarkibi ro'yxatda yuklanmaydi
        var list = await q.OrderByDescending(d => d.CreatedAt)
            .Select(d => new NormativeDocumentDto(d.Id, d.Title, d.DocumentNumber, d.DocumentDate, d.Category,
                d.Description, d.FileName, d.FileSize, d.MimeType, d.UploadedBy, d.CreatedAt, d.UpdatedAt))
            .ToListAsync(ct);
        return Ok(new { success = true, data = list });
    }

    [HttpGet("{id:guid}/view")]
    [RequirePermission("normative-docs.read")]
    public Task<IActionResult> View(Guid id, CancellationToken ct) => SendFile(id, inline: true, ct);

    [HttpGet("{id:guid}/download")]
    [RequirePermission("normative-docs.read")]
    public Task<IActionResult> Download(Guid id, CancellationToken ct) => SendFile(id, inline: false, ct);

    [HttpPost]
    [RequirePermission("normative-docs.create")]
    [RequestSizeLimit(MaxFileBytes + 1024 * 1024)]
    public async Task<IActionResult> Create([FromForm] NormativeDocumentForm form, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(form.Title)) return BadRequest(Fail("Hujjat nomini kiriting"));
        if (form.File is null || form.File.Length == 0) return BadRequest(Fail("Faylni tanlang"));
        var fileError = ValidateFile(form.File);
        if (fileError is not null) return BadRequest(Fail(fileError));

        var now = DateTime.UtcNow;
        var doc = new NormativeDocument
        {
            Id = Guid.NewGuid(),
            Title = form.Title.Trim(),
            DocumentNumber = Clean(form.DocumentNumber),
            DocumentDate = Clean(form.DocumentDate),
            Category = NormalizeCategory(form.Category),
            Description = Clean(form.Description),
            UploadedBy = CurrentUserName(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        await ApplyFile(doc, form.File, ct);
        db.NormativeDocuments.Add(doc);
        await db.SaveChangesAsync(ct);
        await Log("NormativeDocumentCreated", doc);
        return Ok(new { success = true, data = ToDto(doc) });
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("normative-docs.update")]
    [RequestSizeLimit(MaxFileBytes + 1024 * 1024)]
    public async Task<IActionResult> Update(Guid id, [FromForm] NormativeDocumentForm form, CancellationToken ct)
    {
        var doc = await db.NormativeDocuments.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (doc is null) return NotFound(Fail("Hujjat topilmadi"));
        if (string.IsNullOrWhiteSpace(form.Title)) return BadRequest(Fail("Hujjat nomini kiriting"));
        if (form.File is not null && form.File.Length > 0)
        {
            var fileError = ValidateFile(form.File);
            if (fileError is not null) return BadRequest(Fail(fileError));
            await ApplyFile(doc, form.File, ct);
        }
        doc.Title = form.Title.Trim();
        doc.DocumentNumber = Clean(form.DocumentNumber);
        doc.DocumentDate = Clean(form.DocumentDate);
        doc.Category = NormalizeCategory(form.Category);
        doc.Description = Clean(form.Description);
        doc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await Log("NormativeDocumentUpdated", doc);
        return Ok(new { success = true, data = ToDto(doc) });
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("normative-docs.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var doc = await db.NormativeDocuments.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (doc is null) return NotFound(Fail("Hujjat topilmadi"));
        db.NormativeDocuments.Remove(doc);
        await db.SaveChangesAsync(ct);
        await Log("NormativeDocumentDeleted", doc);
        return Ok(new { success = true });
    }

    private async Task<IActionResult> SendFile(Guid id, bool inline, CancellationToken ct)
    {
        var doc = await db.NormativeDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
        if (doc?.FileData is null || doc.FileData.Length == 0) return NotFound(Fail("Hujjat fayli topilmadi"));
        Response.Headers.CacheControl = "private, no-store";
        var mime = string.IsNullOrWhiteSpace(doc.MimeType) ? "application/octet-stream" : doc.MimeType;
        return inline
            ? File(doc.FileData, mime)
            : File(doc.FileData, mime, string.IsNullOrWhiteSpace(doc.FileName) ? "hujjat.pdf" : doc.FileName);
    }

    private static string? ValidateFile(IFormFile file)
    {
        if (file.Length > MaxFileBytes) return "Fayl hajmi 25 MB dan oshmasligi kerak";
        return null;
    }

    private static async Task ApplyFile(NormativeDocument doc, IFormFile file, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        doc.FileData = ms.ToArray();
        doc.FileSize = doc.FileData.LongLength;
        doc.FileName = Path.GetFileName(file.FileName);
        doc.MimeType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/pdf" : file.ContentType;
    }

    private Task Log(string action, NormativeDocument doc) => audit.LogAsync(
        action: action,
        entityType: nameof(NormativeDocument),
        entityId: doc.Id.ToString(),
        details: JsonSerializer.Serialize(new { doc.Title, doc.DocumentNumber, doc.Category, doc.FileName, doc.FileSize }),
        category: "Documents");

    private static NormativeDocumentDto ToDto(NormativeDocument d) => new(d.Id, d.Title, d.DocumentNumber, d.DocumentDate,
        d.Category, d.Description, d.FileName, d.FileSize, d.MimeType, d.UploadedBy, d.CreatedAt, d.UpdatedAt);

    private static string NormalizeCategory(string? c) =>
        Categories.Contains((c ?? "").Trim()) ? c!.Trim() : (string.IsNullOrWhiteSpace(c) ? "internal" : c.Trim());

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private static object Fail(string message) => new { success = false, message };

    private string CurrentUserName() =>
        User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name ?? "Foydalanuvchi";
}
