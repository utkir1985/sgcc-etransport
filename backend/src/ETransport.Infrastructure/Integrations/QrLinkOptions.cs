namespace ETransport.Infrastructure.Integrations;

public class QrLinkOptions
{
    public const string SectionName = "QrLink";

    public string BaseUrl { get; set; } = "http://172.16.90.54:8080/api/documents/register";
    public string VerificationBaseUrl { get; set; } = "https://qrlink.sgcc.uz/verify";
    public string SourceSystem { get; set; } = "E-TRANPORT";
    public string ApiKey { get; set; } = "ql_e-tranport_f47f11a234d4409b8e950c5bd7a20bcd";
    public bool Enabled { get; set; } = true;
    public int TimeoutSeconds { get; set; } = 10;
}
