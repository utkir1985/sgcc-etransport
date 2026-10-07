using System.Security.Claims;
using System.Text.Json;
using ETransport.Core.Constants;
using ETransport.Core.DTOs;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ETransport.Modules.Dashboard.Controllers;

public sealed record TrashItemDto(
    Guid Id,
    string EntityType,
    Guid EntityId,
    string Title,
    string Category,
    string RelatedNumber,
    string FileName,
    string ContentType,
    long SizeBytes,
    bool HasFile,
    string DeletedByName,
    string DeletedByRole,
    DateTime DeletedAt,
    string DeleteReason,
    DateTime ExpiresAt,
    int DaysRemaining,
    bool IsRestored,
    string? PayloadJson = null
);

public sealed record TrashStatsDto(
    int TotalCount,
    int AttachmentCount,
    int WagonCount,
    int ArrivalCount,
    int OrderCount,
    long TotalSizeBytes,
    int ExpiringSoonCount
);

public sealed record TrashListResponse(
    List<TrashItemDto> Items,
    TrashStatsDto Stats,
    int TotalItems,
    int Page,
    int PageSize
);

[ApiController]
[Route("api/admin/trash")]
[Authorize(Roles = UserRoles.Admin)]
public class TrashController(AppDbContext db, IFileStorageService fileStorage) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<TrashListResponse>>> GetList(
        [FromQuery] string? category = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.RecycleBinItems.Where(r => !r.IsRestored);

        if (!string.IsNullOrWhiteSpace(category) && !string.Equals(category, "all", StringComparison.OrdinalIgnoreCase))
        {
            var cat = category.Trim().ToLowerInvariant();
            if (cat == "expiring")
            {
                var soonDate = DateTime.UtcNow.AddDays(7);
                query = query.Where(r => r.ExpiresAt <= soonDate);
            }
            else if (cat == "railway" || cat == "wagons" || cat == "arrival" || cat == "wagon")
            {
                query = query.Where(r => r.Category.ToLower() == "arrival" || r.Category.ToLower() == "wagon");
            }
            else
            {
                query = query.Where(r => r.Category.ToLower() == cat);
            }
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(r =>
                EF.Functions.ILike(r.Title, $"%{term}%")
                || EF.Functions.ILike(r.RelatedNumber, $"%{term}%")
                || EF.Functions.ILike(r.FileName, $"%{term}%")
                || EF.Functions.ILike(r.DeletedByName, $"%{term}%"));
        }

        var totalItems = await query.CountAsync();

        var rawItems = await query
            .OrderByDescending(r => r.DeletedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var now = DateTime.UtcNow;

        var userIds = rawItems.Select(r => r.DeletedById).Where(id => id != Guid.Empty).Distinct().ToList();
        var usersById = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName);
        var allUsers = await db.Users.Select(u => new { u.Username, u.FullName }).ToListAsync();
        var usersByUsername = allUsers.ToDictionary(u => u.Username.ToLower(), u => u.FullName);

        string ResolveFullName(RecycleBinItem item)
        {
            if (item.DeletedById != Guid.Empty && usersById.TryGetValue(item.DeletedById, out var nameById) && !string.IsNullOrWhiteSpace(nameById))
                return nameById;
            if (!string.IsNullOrWhiteSpace(item.DeletedByName) && usersByUsername.TryGetValue(item.DeletedByName.ToLower(), out var nameByUname) && !string.IsNullOrWhiteSpace(nameByUname))
                return nameByUname;
            return !string.IsNullOrWhiteSpace(item.DeletedByName) ? item.DeletedByName : "Noma'lum";
        }

        var dtos = rawItems.Select(r => new TrashItemDto(
            r.Id,
            r.EntityType,
            r.EntityId,
            r.Title,
            r.Category,
            r.RelatedNumber,
            r.FileName,
            r.ContentType,
            r.SizeBytes,
            !string.IsNullOrWhiteSpace(r.ObjectKey),
            ResolveFullName(r),
            r.DeletedByRole,
            r.DeletedAt,
            r.DeleteReason,
            r.ExpiresAt,
            Math.Max(0, (int)(r.ExpiresAt - now).TotalDays),
            r.IsRestored,
            r.PayloadJson
        )).ToList();

        // Statistikani hisoblash (barcha faol korzina elementlari bo'yicha)
        var allActive = await db.RecycleBinItems.Where(r => !r.IsRestored).ToListAsync();
        var stats = new TrashStatsDto(
            TotalCount: allActive.Count,
            AttachmentCount: allActive.Count(r => r.Category == "attachment"),
            WagonCount: allActive.Count(r => r.Category == "wagon"),
            ArrivalCount: allActive.Count(r => r.Category == "arrival"),
            OrderCount: allActive.Count(r => r.Category == "order"),
            TotalSizeBytes: allActive.Sum(r => r.SizeBytes),
            ExpiringSoonCount: allActive.Count(r => (r.ExpiresAt - now).TotalDays <= 5)
        );

        return Ok(new ApiResponse<TrashListResponse>(true, new TrashListResponse(dtos, stats, totalItems, page, pageSize)));
    }

    // Class darajasidagi [Authorize(Roles = Admin)] shu yerda ham kuchda qoladi:
    // frontend so'rovga har doim token qo'shadi (api.ts:downloadTrashFile), shuning
    // uchun [AllowAnonymous] hech qanday haqiqiy ehtiyojga xizmat qilmagan —
    // faqat loginsiz foydalanuvchiga ochiq eshik qoldirgan.
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> DownloadFile(Guid id, [FromQuery] string? key = null, [FromQuery] string? name = null)
    {
        var item = await db.RecycleBinItems.FirstOrDefaultAsync(r => r.Id == id);
        if (item is null)
            return NotFound("Element topilmadi");

        // `key` orqali faqat shu elementning o'z arxiv nusxasi (PayloadJson) ichida
        // haqiqatan mavjud bo'lgan qiymat qabul qilinadi — aks holda chaqiruvchi
        // istalgan yo'lni berib, serverdagi boshqa faylni so'rashi mumkin edi.
        var requestedKey = !string.IsNullOrWhiteSpace(key) ? key : null;
        var keyIsOwnPayload = requestedKey is not null
            && !string.IsNullOrWhiteSpace(item.PayloadJson)
            && item.PayloadJson.Contains(requestedKey, StringComparison.Ordinal);
        var objectKey = keyIsOwnPayload ? requestedKey! : item.ObjectKey;
        var fileName = !string.IsNullOrWhiteSpace(name) ? name : (string.IsNullOrWhiteSpace(item.FileName) ? "ilova.pdf" : item.FileName);
        var contentType = string.IsNullOrWhiteSpace(item.ContentType) ? "application/pdf" : item.ContentType;

        Stream? stream = null;
        if (!string.IsNullOrWhiteSpace(objectKey))
        {
            try
            {
                stream = await fileStorage.DownloadAsync(objectKey);
            }
            catch { stream = null; }
        }

        // Eslatma: ilgari shu yerda fayl topilmasa diskdagi ixtiyoriy PDF fallback
        // sifatida qaytarilardi — bu boshqa foydalanuvchining hujjatini noto‘g‘ri
        // so‘rovga bog‘lab yuborishi mumkin edi. Endi topilmasa aniq 404 qaytadi.
        if (stream is null)
            return NotFound("Fayl xotirada topilmadi");

        return File(stream, contentType, fileName);
    }

    [HttpPost("{id:guid}/restore")]
    public async Task<ActionResult<ApiResponse<object>>> Restore(Guid id)
    {
        var item = await db.RecycleBinItems.FirstOrDefaultAsync(r => r.Id == id);
        if (item is null)
            return NotFound(new ApiResponse<object>(false, null, "Korzina elementi topilmadi"));

        var currentUserName = User.FindFirstValue(ClaimTypes.Name) ?? "Admin";

        if (item.EntityType == "OrderAttachment")
        {
            var json = item.PayloadJson;
            if (string.IsNullOrWhiteSpace(json))
                return BadRequest(new ApiResponse<object>(false, null, "Tiklash ma'lumotlari mavjud emas"));

            var doc = JsonDocument.Parse(json).RootElement;
            var orderId = doc.GetProperty("MonthlyOrderId").GetGuid();

            var orderExists = await db.MonthlyOrders.AnyAsync(o => o.Id == orderId);
            if (!orderExists)
                return BadRequest(new ApiResponse<object>(false, null, "Ushbu fayl tegishli bo‘lgan buyurtma bazada mavjud emas (o‘chirilgan)"));

            var attachment = new OrderAttachment
            {
                Id = item.EntityId,
                MonthlyOrderId = orderId,
                FileName = item.FileName,
                ContentType = item.ContentType,
                SizeBytes = item.SizeBytes,
                ObjectKey = item.ObjectKey,
                UploadedById = item.DeletedById,
                UploadedAt = item.DeletedAt,
            };

            db.OrderAttachments.Add(attachment);
            db.RecycleBinItems.Remove(item);
            await db.SaveChangesAsync();

            return Ok(new ApiResponse<object>(true, null, $"«{item.FileName}» muvaffaqiyatli buyurtmaga qaytarildi"));
        }

        if (item.EntityType == "EmptyWagonUnit")
        {
            var json = item.PayloadJson;
            if (string.IsNullOrWhiteSpace(json))
                return BadRequest(new ApiResponse<object>(false, null, "Tiklash ma'lumotlari mavjud emas"));

            var unit = JsonSerializer.Deserialize<EmptyWagonUnit>(json);
            if (unit is null)
                return BadRequest(new ApiResponse<object>(false, null, "Vagon ma'lumoti o‘qilmadi"));

            var arrival = await db.EmptyWagonArrivals.Include(a => a.Units).FirstOrDefaultAsync(a => a.Id == unit.EmptyWagonArrivalId);
            if (arrival is null)
                return BadRequest(new ApiResponse<object>(false, null, "Vagon tegishli bo‘lgan kiritish partiyasi topilmadi"));

            if (arrival.Units.Any(u => u.WagonNumber == unit.WagonNumber))
                return BadRequest(new ApiResponse<object>(false, null, $"Partiyada «{unit.WagonNumber}» raqamli vagon allaqachon mavjud"));

            unit.Id = Guid.NewGuid();
            unit.SortOrder = arrival.Units.Count == 0 ? 0 : arrival.Units.Max(u => u.SortOrder) + 1;
            arrival.Units.Add(unit);
            db.EmptyWagonUnits.Add(unit);
            arrival.WagonCount = arrival.Units.Count;

            db.RecycleBinItems.Remove(item);
            await db.SaveChangesAsync();

            return Ok(new ApiResponse<object>(true, null, $"«{unit.WagonNumber}» vagoni partiyaga qaytarildi"));
        }

        if (item.EntityType == "MonthlyOrder")
        {
            var json = item.PayloadJson;
            if (string.IsNullOrWhiteSpace(json))
                return BadRequest(new ApiResponse<object>(false, null, "Tiklash ma'lumotlari mavjud emas"));

            var doc = JsonDocument.Parse(json).RootElement;
            var orderElement = doc.GetProperty("Order");
            var orderId = orderElement.GetProperty("Id").GetGuid();
            var orderNumber = orderElement.GetProperty("OrderNumber").GetString() ?? "";

            if (await db.MonthlyOrders.AnyAsync(o => o.OrderNumber == orderNumber))
                return BadRequest(new ApiResponse<object>(false, null, $"«{orderNumber}» raqamli buyurtma tizimda allaqachon mavjud"));

            var order = new MonthlyOrder
            {
                Id = orderId,
                OrderNumber = orderNumber,
                Year = orderElement.GetProperty("Year").GetInt32(),
                Month = orderElement.GetProperty("Month").GetInt32(),
                LogisticsType = orderElement.GetProperty("LogisticsType").GetString() ?? LogisticsTypes.Railway,
                ContractNumber = orderElement.TryGetProperty("ContractNumber", out var cn) ? (cn.GetString() ?? "") : "",
                ProductType = orderElement.GetProperty("ProductType").GetString() ?? "",
                Status = orderElement.TryGetProperty("Status", out var st) && Enum.TryParse<OrderStatus>(st.GetString() ?? st.GetInt32().ToString(), true, out var parsedStatus) ? parsedStatus : OrderStatus.Draft,
                CreatedById = orderElement.TryGetProperty("CreatedById", out var cb) && cb.ValueKind == JsonValueKind.String && Guid.TryParse(cb.GetString(), out var cbId) ? cbId : item.DeletedById,
                CreatedAt = orderElement.TryGetProperty("CreatedAt", out var ca) && ca.TryGetDateTime(out var caDate) ? caDate : DateTime.UtcNow,
                SubmittedAt = orderElement.TryGetProperty("SubmittedAt", out var subAt) && subAt.TryGetDateTime(out var sDate) ? sDate : null,
                SubmittedById = orderElement.TryGetProperty("SubmittedById", out var subId) && subId.ValueKind == JsonValueKind.String && Guid.TryParse(subId.GetString(), out var sGuid) ? sGuid : null,
                ApprovedAt = orderElement.TryGetProperty("ApprovedAt", out var appAt) && appAt.TryGetDateTime(out var aDate) ? aDate : null,
                ApprovedByAccountingId = orderElement.TryGetProperty("ApprovedByAccountingId", out var acctId) && acctId.ValueKind == JsonValueKind.String && Guid.TryParse(acctId.GetString(), out var acGuid) ? acGuid : null,
                AccountingApproverName = orderElement.TryGetProperty("AccountingApproverName", out var acName) ? (acName.GetString() ?? "") : "",
                MarketingApprovedAt = orderElement.TryGetProperty("MarketingApprovedAt", out var mktAt) && mktAt.TryGetDateTime(out var mDate) ? mDate : null,
                ApprovedByMarketingId = orderElement.TryGetProperty("ApprovedByMarketingId", out var mktId) && mktId.ValueKind == JsonValueKind.String && Guid.TryParse(mktId.GetString(), out var mGuid) ? mGuid : null,
                MarketingApproverName = orderElement.TryGetProperty("MarketingApproverName", out var mName) ? (mName.GetString() ?? "") : "",
                SubmittedToDispatchAt = orderElement.TryGetProperty("SubmittedToDispatchAt", out var disSubAt) && disSubAt.TryGetDateTime(out var dsDate) ? dsDate : null,
                SubmittedToDispatchById = orderElement.TryGetProperty("SubmittedToDispatchById", out var disSubId) && disSubId.ValueKind == JsonValueKind.String && Guid.TryParse(disSubId.GetString(), out var dsGuid) ? dsGuid : null,
                DispatchApprovedAt = orderElement.TryGetProperty("DispatchApprovedAt", out var disAt) && disAt.TryGetDateTime(out var dDate) ? dDate : null,
                ApprovedByDispatchId = orderElement.TryGetProperty("ApprovedByDispatchId", out var disId) && disId.ValueKind == JsonValueKind.String && Guid.TryParse(disId.GetString(), out var dGuid) ? dGuid : null,
                DispatchApproverName = orderElement.TryGetProperty("DispatchApproverName", out var dName) ? (dName.GetString() ?? "") : "",
                DeputyApprovedAt = orderElement.TryGetProperty("DeputyApprovedAt", out var depAt) && depAt.TryGetDateTime(out var depDate) ? depDate : null,
                ApprovedByDeputyId = orderElement.TryGetProperty("ApprovedByDeputyId", out var depId) && depId.ValueKind == JsonValueKind.String && Guid.TryParse(depId.GetString(), out var depGuid) ? depGuid : null,
                DeputyApproverName = orderElement.TryGetProperty("DeputyApproverName", out var depName) ? (depName.GetString() ?? "") : "",
                QrGlobalId = orderElement.TryGetProperty("QrGlobalId", out var qrGid) ? (qrGid.GetString() ?? "") : "",
                QrVerificationUrl = orderElement.TryGetProperty("QrVerificationUrl", out var qrUrl) ? (qrUrl.GetString() ?? "") : "",
                QrCodeBase64 = orderElement.TryGetProperty("QrCodeBase64", out var qrB64) ? (qrB64.GetString() ?? "") : "",
                QrRegisteredAt = orderElement.TryGetProperty("QrRegisteredAt", out var qrDate) && qrDate.TryGetDateTime(out var qDate) ? qDate : null
            };

            if (doc.TryGetProperty("Lines", out var linesElement) && linesElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var lineElem in linesElement.EnumerateArray())
                {
                    var line = new MonthlyOrderLine
                    {
                        Id = lineElem.TryGetProperty("Id", out var lid) && lid.ValueKind == JsonValueKind.String && Guid.TryParse(lid.GetString(), out var lineGuid) ? lineGuid : Guid.NewGuid(),
                        MonthlyOrderId = order.Id,
                        SortOrder = lineElem.TryGetProperty("SortOrder", out var so) ? so.GetInt32() : 0,
                        Contractor = lineElem.TryGetProperty("Contractor", out var c) ? (c.GetString() ?? "") : "",
                        WagonCount = lineElem.TryGetProperty("WagonCount", out var wc) ? wc.GetInt32() : 0,
                        TonCount = lineElem.TryGetProperty("TonCount", out var tc) && tc.TryGetDecimal(out var tVal) ? tVal : 0,
                        QuantityUnit = lineElem.TryGetProperty("QuantityUnit", out var qu) ? (qu.GetString() ?? OrderQuantityUnits.Wagon) : OrderQuantityUnits.Wagon,
                        DestinationStation = lineElem.TryGetProperty("DestinationStation", out var ds) ? (ds.GetString() ?? "") : "",
                        AccountingStatus = lineElem.TryGetProperty("AccountingStatus", out var acs) ? (acs.GetString() ?? LineAccountingStatuses.Pending) : LineAccountingStatuses.Pending
                    };
                    order.Lines.Add(line);
                }
            }

            if (doc.TryGetProperty("Attachments", out var attachmentsElement) && attachmentsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var attElem in attachmentsElement.EnumerateArray())
                {
                    var att = new OrderAttachment
                    {
                        Id = attElem.TryGetProperty("Id", out var aid) && aid.ValueKind == JsonValueKind.String && Guid.TryParse(aid.GetString(), out var aGuid) ? aGuid : Guid.NewGuid(),
                        MonthlyOrderId = order.Id,
                        FileName = attElem.TryGetProperty("FileName", out var fn) ? (fn.GetString() ?? "Ilova.pdf") : "Ilova.pdf",
                        ContentType = attElem.TryGetProperty("ContentType", out var ct) ? (ct.GetString() ?? "application/pdf") : "application/pdf",
                        SizeBytes = attElem.TryGetProperty("SizeBytes", out var sb) && sb.TryGetInt64(out var sVal) ? sVal : 245760,
                        ObjectKey = attElem.TryGetProperty("ObjectKey", out var ok) ? (ok.GetString() ?? "") : "",
                        UploadedById = order.CreatedById,
                        UploadedAt = attElem.TryGetProperty("UploadedAt", out var ua) && ua.TryGetDateTime(out var uDate) ? uDate : DateTime.UtcNow
                    };
                    order.Attachments.Add(att);
                }
            }

            db.MonthlyOrders.Add(order);
            db.RecycleBinItems.Remove(item);
            await db.SaveChangesAsync();

            return Ok(new ApiResponse<object>(true, null, $"«{order.OrderNumber}» buyurtmasi muvaffaqiyatli tiklandi"));
        }

        if (item.EntityType == "LoadingRegistry")
        {
            var json = item.PayloadJson;
            if (string.IsNullOrWhiteSpace(json))
                return BadRequest(new ApiResponse<object>(false, null, "Tiklash ma'lumotlari mavjud emas"));

            var reg = JsonSerializer.Deserialize<LoadingRegistry>(json);
            if (reg is null)
                return BadRequest(new ApiResponse<object>(false, null, "Yuk xati ma'lumotlari o‘qilmadi"));

            if (await db.LoadingRegistries.AnyAsync(r => r.RegistryNumber == reg.RegistryNumber))
                return BadRequest(new ApiResponse<object>(false, null, $"«{reg.RegistryNumber}» raqamli yuk xati allaqachon mavjud"));

            db.LoadingRegistries.Add(reg);

            // Chiqib ketgan yuk xati tiklansa, uning vagonlari yana «chiqib ketgan» bo‘ladi
            // (o‘chirishda ular fondga qaytarilgan edi).
            if (reg.ExitedToKengsoyAt is not null)
            {
                List<(Guid? SourceArrivalId, string WagonNumber)> routes = [];
                try
                {
                    using var routesDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(reg.WagonRoutesJson) ? "[]" : reg.WagonRoutesJson);
                    foreach (var r in routesDoc.RootElement.EnumerateArray())
                    {
                        var num = r.TryGetProperty("WagonNumber", out var wnEl) ? wnEl.GetString()
                            : r.TryGetProperty("wagonNumber", out var wnEl2) ? wnEl2.GetString() : null;
                        Guid? src = null;
                        if ((r.TryGetProperty("SourceArrivalId", out var srcEl) || r.TryGetProperty("sourceArrivalId", out srcEl))
                            && srcEl.ValueKind == JsonValueKind.String && Guid.TryParse(srcEl.GetString(), out var parsed))
                            src = parsed;
                        if (!string.IsNullOrWhiteSpace(num)) routes.Add((src, num.Trim()));
                    }
                }
                catch (JsonException) { /* eski format — partiya bo‘yicha */ }

                var arrivalIds = routes.Where(r => r.SourceArrivalId.HasValue).Select(r => r.SourceArrivalId!.Value)
                    .Append(reg.EmptyWagonArrivalId).Distinct().ToList();
                var units = await db.EmptyWagonUnits.Where(u => arrivalIds.Contains(u.EmptyWagonArrivalId)).ToListAsync();
                var numbers = routes.Select(r => r.WagonNumber).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var u in units)
                {
                    if (numbers.Count > 0 && !numbers.Contains(u.WagonNumber)) continue;
                    u.ScaleExitedAt ??= reg.ExitedToKengsoyAt;
                }
            }

            db.RecycleBinItems.Remove(item);
            await db.SaveChangesAsync();

            return Ok(new ApiResponse<object>(true, null, $"«{reg.RegistryNumber}» yuk xati muvaffaqiyatli tiklandi"));
        }

        if (item.EntityType == "EmptyWagonArrival")
        {
            var json = item.PayloadJson;
            if (string.IsNullOrWhiteSpace(json))
                return BadRequest(new ApiResponse<object>(false, null, "Tiklash ma'lumotlari mavjud emas"));

            var doc = JsonDocument.Parse(json).RootElement;
            var arrivalElem = doc.GetProperty("Arrival");
            var arrivalNumber = arrivalElem.GetProperty("ArrivalNumber").GetString() ?? "";

            if (await db.EmptyWagonArrivals.AnyAsync(a => a.ArrivalNumber == arrivalNumber))
                return BadRequest(new ApiResponse<object>(false, null, $"«{arrivalNumber}» raqamli partiya bazada allaqachon mavjud"));

            var arrival = new EmptyWagonArrival
            {
                Id = arrivalElem.GetProperty("Id").GetGuid(),
                ArrivalNumber = arrivalNumber,
                WagonCount = arrivalElem.GetProperty("WagonCount").GetInt32(),
                WagonNumbers = arrivalElem.TryGetProperty("WagonNumbers", out var wn) ? (wn.GetString() ?? "") : "",
                CisternNumbers = arrivalElem.TryGetProperty("CisternNumbers", out var cn) ? (cn.GetString() ?? "") : "",
                ProductType = arrivalElem.TryGetProperty("ProductType", out var pt) ? (pt.GetString() ?? "") : "",
                TrackNumber = arrivalElem.TryGetProperty("TrackNumber", out var tn) ? (tn.GetString() ?? "") : "",
                Stage = arrivalElem.TryGetProperty("Stage", out var st) ? (st.GetString() ?? "Arrived") : "Arrived",
                TareWeight = arrivalElem.TryGetProperty("TareWeight", out var tw) ? (tw.GetString() ?? "") : "",
                GrossWeight = arrivalElem.TryGetProperty("GrossWeight", out var gw) ? (gw.GetString() ?? "") : "",
                VerifiedWagonNumbers = arrivalElem.TryGetProperty("VerifiedWagonNumbers", out var vw) ? (vw.GetString() ?? "") : "",
                Notes = arrivalElem.TryGetProperty("Notes", out var nt) ? (nt.GetString() ?? "") : "",
                CreatedAt = DateTime.UtcNow,
            };

            if (doc.TryGetProperty("Units", out var unitsElem) && unitsElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var uElem in unitsElem.EnumerateArray())
                {
                    var unit = JsonSerializer.Deserialize<EmptyWagonUnit>(uElem.GetRawText());
                    if (unit != null)
                    {
                        unit.Id = Guid.NewGuid();
                        unit.EmptyWagonArrivalId = arrival.Id;
                        arrival.Units.Add(unit);
                        db.EmptyWagonUnits.Add(unit);
                    }
                }
            }

            db.EmptyWagonArrivals.Add(arrival);
            db.RecycleBinItems.Remove(item);
            await db.SaveChangesAsync();

            return Ok(new ApiResponse<object>(true, null, $"«{arrival.ArrivalNumber}» partiyasi muvaffaqiyatli tiklandi"));
        }

        // Boshqa ob'ektlar uchun oddiy tiklash
        db.RecycleBinItems.Remove(item);
        await db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, null, "Element korzinadan chiqarildi"));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> PermanentDelete(Guid id)
    {
        var item = await db.RecycleBinItems.FirstOrDefaultAsync(r => r.Id == id);
        if (item is null)
            return NotFound(new ApiResponse<object>(false, null, "Element topilmadi"));

        if (!string.IsNullOrWhiteSpace(item.ObjectKey))
        {
            try
            {
                await fileStorage.DeleteAsync(item.ObjectKey);
            }
            catch
            {
                /* fayl allaqachon yo'q bo'lishi mumkin */
            }
        }

        db.RecycleBinItems.Remove(item);
        await db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, null, "Element butunlay yo‘q qilindi"));
    }

    [HttpPost("empty")]
    public async Task<ActionResult<ApiResponse<object>>> EmptyTrash(
        [FromQuery] bool onlyExpired = false,
        [FromQuery] bool expiredOnly = false)
    {
        var filterExpired = onlyExpired || expiredOnly;
        var query = db.RecycleBinItems.AsQueryable();
        if (filterExpired)
        {
            query = query.Where(r => r.ExpiresAt <= DateTime.UtcNow);
        }

        var items = await query.ToListAsync();
        foreach (var item in items)
        {
            if (!string.IsNullOrWhiteSpace(item.ObjectKey))
            {
                try { await fileStorage.DeleteAsync(item.ObjectKey); } catch { }
            }
            db.RecycleBinItems.Remove(item);
        }

        await db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { count = items.Count }, $"{items.Count} ta element korzinadan tozalandi"));
    }
}
