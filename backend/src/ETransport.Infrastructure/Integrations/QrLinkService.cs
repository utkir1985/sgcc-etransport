using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ETransport.Infrastructure.Integrations;

public class QrLinkService : IQrLinkService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly QrLinkOptions _options;
    private readonly ILogger<QrLinkService> _logger;

    public QrLinkService(
        IHttpClientFactory httpClientFactory,
        IOptions<QrLinkOptions> options,
        ILogger<QrLinkService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<QrLinkRegistrationResult> RegisterDocumentAsync(
        QrLinkRegisterRequest request,
        byte[]? fileBytes = null,
        string? fileName = null,
        CancellationToken cancellationToken = default)
    {
        var registeredAt = DateTime.UtcNow;
        var sourceSystem = string.IsNullOrWhiteSpace(_options.SourceSystem) ? "E-TRANSPORT" : _options.SourceSystem.Trim();
        var verifyBase = string.IsNullOrWhiteSpace(_options.VerificationBaseUrl)
            ? "https://qrlink.sgcc.uz/verify"
            : _options.VerificationBaseUrl.TrimEnd('/');

        // 1. Markaziy tizim yoqilgan bo‘lsa, HTTP so‘rov yuborish
        if (_options.Enabled && !string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            try
            {
                var client = _httpClientFactory.CreateClient("QrLink");
                client.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds > 0 ? _options.TimeoutSeconds : 10);

                using var message = new HttpRequestMessage(HttpMethod.Post, _options.BaseUrl);
                message.Headers.Add("X-Source-System", sourceSystem);
                if (!string.IsNullOrWhiteSpace(_options.ApiKey))
                {
                    message.Headers.Add("X-Api-Key", _options.ApiKey.Trim());
                }

                using var content = new MultipartFormDataContent();
                content.Add(new StringContent(sourceSystem), "sourceSystem");
                content.Add(new StringContent(request.SourceDocumentId ?? ""), "sourceDocumentId");
                content.Add(new StringContent(request.DocumentType ?? "Hujjat"), "documentType");
                content.Add(new StringContent(request.Title ?? request.SourceDocumentId ?? "Hujjat"), "title");

                if (!string.IsNullOrWhiteSpace(request.Status))
                {
                    content.Add(new StringContent(request.Status), "status");
                }
                if (!string.IsNullOrWhiteSpace(request.OwnerName))
                {
                    content.Add(new StringContent(request.OwnerName), "ownerName");
                }
                if (!string.IsNullOrWhiteSpace(request.MetadataJson))
                {
                    content.Add(new StringContent(request.MetadataJson), "metadataJson");
                }
                if (!string.IsNullOrWhiteSpace(request.WorkflowJson))
                {
                    content.Add(new StringContent(request.WorkflowJson), "workflow");
                }

                if (fileBytes is not null && fileBytes.Length > 0)
                {
                    var fileContent = new ByteArrayContent(fileBytes);
                    fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
                    content.Add(fileContent, "file", fileName ?? "document.pdf");
                }

                message.Content = content;

                var response = await client.SendAsync(message, cancellationToken);

                // Agar 429 (Rate limit) bo'lsa, biroz kutib qayta urinish
                if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                {
                    _logger.LogWarning("Markaziy QR Link 429 TooManyRequests qaytardi. 3 soniyadan so'ng qayta urinilmoqda...");
                    await Task.Delay(3000, cancellationToken);
                    using var retryMsg = new HttpRequestMessage(HttpMethod.Post, _options.BaseUrl);
                    if (!string.IsNullOrWhiteSpace(_options.SourceSystem)) retryMsg.Headers.Add("X-Source-System", sourceSystem);
                    if (!string.IsNullOrWhiteSpace(_options.ApiKey)) retryMsg.Headers.Add("X-Api-Key", _options.ApiKey.Trim());
                    using var retryContent = new MultipartFormDataContent();
                    retryContent.Add(new StringContent(sourceSystem), "sourceSystem");
                    retryContent.Add(new StringContent(request.SourceDocumentId ?? ""), "sourceDocumentId");
                    retryContent.Add(new StringContent(request.DocumentType ?? "Hujjat"), "documentType");
                    retryContent.Add(new StringContent(request.Title ?? request.SourceDocumentId ?? "Hujjat"), "title");
                    if (!string.IsNullOrWhiteSpace(request.Status)) retryContent.Add(new StringContent(request.Status), "status");
                    if (!string.IsNullOrWhiteSpace(request.OwnerName)) retryContent.Add(new StringContent(request.OwnerName), "ownerName");
                    if (!string.IsNullOrWhiteSpace(request.MetadataJson)) retryContent.Add(new StringContent(request.MetadataJson), "metadataJson");
                    if (!string.IsNullOrWhiteSpace(request.WorkflowJson)) retryContent.Add(new StringContent(request.WorkflowJson), "workflow");
                    if (fileBytes is not null && fileBytes.Length > 0)
                    {
                        var fc = new ByteArrayContent(fileBytes);
                        fc.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
                        retryContent.Add(fc, "file", fileName ?? "document.pdf");
                    }
                    retryMsg.Content = retryContent;
                    response = await client.SendAsync(retryMsg, cancellationToken);
                }

                // Preserve the source identity. QrLink exposes overwrite at /update.
                if (response.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    response.Dispose();
                    using var update = new HttpRequestMessage(HttpMethod.Post,
                        _options.BaseUrl.TrimEnd('/')[..(_options.BaseUrl.TrimEnd('/').LastIndexOf('/') + 1)] + "update");
                    update.Headers.Add("X-Source-System", sourceSystem);
                    if (!string.IsNullOrWhiteSpace(_options.ApiKey)) update.Headers.Add("X-Api-Key", _options.ApiKey.Trim());
                    update.Content = content;
                    response = await client.SendAsync(update, cancellationToken);
                }

                if (response.IsSuccessStatusCode)
                {
                    var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
                    using var doc = JsonDocument.Parse(responseJson);
                    var root = doc.RootElement;

                    if (root.TryGetProperty("data", out var dataElem) || (dataElem = root).ValueKind == JsonValueKind.Object)
                    {
                        var globalId = dataElem.GetProperty("globalId").GetString() ?? "";
                        var rawUrl = dataElem.TryGetProperty("verificationUrl", out var vUrl) ? vUrl.GetString() ?? "" : "";
                        var verificationUrl = !string.IsNullOrWhiteSpace(globalId) ? $"{verifyBase}/{globalId}" : rawUrl;
                        var qrCodeBase64 = dataElem.TryGetProperty("qrCodeBase64", out var qrProp) ? qrProp.GetString() ?? "" : "";
                        var regAt = dataElem.TryGetProperty("registeredAt", out var regAtProp) && regAtProp.TryGetDateTime(out var parsedTime)
                            ? parsedTime
                            : registeredAt;

                        if (!string.IsNullOrWhiteSpace(globalId))
                        {
                            _logger.LogInformation("Markaziy QR Link tizimida hujjat muvaffaqiyatli ro‘yxatdan o‘tkazildi: {GlobalId}, {DocId}", globalId, request.SourceDocumentId);
                            return new QrLinkRegistrationResult(
                                globalId,
                                verificationUrl,
                                qrCodeBase64,
                                regAt
                            );
                        }
                    }
                }
                else
                {
                    var errBody = await response.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning("Markaziy QR Link xatosi ({StatusCode}): {Body}", response.StatusCode, errBody);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Markaziy QR Link tizimiga ulanishda xatolik yuz berdi ({DocId}). Standart zaxira rejimiga o‘tilmoqda.", request.SourceDocumentId);
            }
        }

        // 2. Standart zaxira (fallback): Agar markaziy QR Link ulanmasa, bo‘sh qaytaramiz (tizim lokal tekshiruv havolasidan foydalanadi va 404 ko‘rsatmaydi)
        return new QrLinkRegistrationResult(
            "",
            "",
            "",
            registeredAt
        );
    }
}
