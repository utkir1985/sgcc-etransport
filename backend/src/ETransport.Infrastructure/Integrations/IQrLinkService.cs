namespace ETransport.Infrastructure.Integrations;

public record QrLinkRegisterRequest(
    string SourceDocumentId,
    string DocumentType,
    string Title,
    string Status = "Approved",
    string OwnerName = "",
    string MetadataJson = "",
    string WorkflowJson = ""
);

public record QrLinkRegistrationResult(
    string GlobalId,
    string VerificationUrl,
    string QrCodeBase64,
    DateTime RegisteredAt
);

public interface IQrLinkService
{
    Task<QrLinkRegistrationResult> RegisterDocumentAsync(
        QrLinkRegisterRequest request,
        byte[]? fileBytes = null,
        string? fileName = null,
        CancellationToken cancellationToken = default);
}
