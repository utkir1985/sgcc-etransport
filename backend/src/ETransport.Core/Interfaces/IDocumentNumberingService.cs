namespace ETransport.Core.Interfaces;

public interface IDocumentNumberingService
{
    Task<string> GenerateInboundBatchNumberAsync(CancellationToken ct = default);
    Task<string> GenerateOutboundBatchNumberAsync(CancellationToken ct = default);
    Task<string> GenerateDefectActNumberAsync(CancellationToken ct = default);
    Task<string> GenerateSealDefectActNumberAsync(CancellationToken ct = default);
    Task<string> GenerateWaybillNumberAsync(string? basePartyNumber = null, CancellationToken ct = default);
    Task<string> GenerateOrderNumberAsync(string logisticsType, string productType, CancellationToken ct = default);
}
