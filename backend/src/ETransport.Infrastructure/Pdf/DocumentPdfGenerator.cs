using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ETransport.Infrastructure.Pdf;

public class DocumentPdfGenerator : IDocumentPdfGenerator
{
    static DocumentPdfGenerator()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private const string CheckCircleSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#16a34a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/></svg>";

    private static byte[] GenerateQrPngBytes(string text, bool drawQuietZones = false)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<byte>();
        try
        {
            var cleanText = text
                .Replace('‘', '\'')
                .Replace('’', '\'')
                .Replace('`', '\'')
                .Replace('ʻ', '\'')
                .Replace('ʼ', '\'');
            using var qrGenerator = new QRCodeGenerator();
            using var qrCodeData = qrGenerator.CreateQrCode(cleanText, QRCodeGenerator.ECCLevel.M);
            using var qrCode = new PngByteQRCode(qrCodeData);
            return qrCode.GetGraphic(20, drawQuietZones);
        }
        catch
        {
            return Array.Empty<byte>();
        }
    }

    public byte[] GenerateDefectActPdf(DefectActPdfModel model)
    {
        const string CheckCircleSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#16a34a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/></svg>";

        var mainQrTarget = !string.IsNullOrWhiteSpace(model.QrVerificationUrl)
            ? model.QrVerificationUrl
            : (!string.IsNullOrWhiteSpace(model.QrGlobalId)
                ? $"https://qrlink.sgcc.uz/verify/{model.QrGlobalId}"
                : $"https://qrlink.sgcc.uz/verify/{model.ActNumber}");

        var qrBytes = GenerateQrPngBytes(mainQrTarget);

        var approvedAt = model.ApprovedAt ?? model.CreatedAt;
        var dateFormatted = $"{approvedAt:dd.MM.yyyy} {approvedAt:HH:mm}";

        var isPlatform = (model.WagonType ?? "").ToLowerInvariant().Contains("platform") || (model.ActType ?? "").StartsWith("platform");
        var noun = isPlatform ? "fiting platforma(lari)" : "gaz sisterna(lari)";
        var reason = (model.ActType ?? "").EndsWith("_noproduct") ? "mahsulot yo‘q bo‘lganligi sababli" : "ta‘mirtalab bo‘lganligi sababli";
        var scaleRole = isPlatform ? "TYTT xizmati h/k yurituvchisi" : "TYTT xizmati taroziboni";
        var scaleRoleShort = isPlatform ? "h/k yurituvchisi" : "taroziboni";
        var wagonLine = !string.IsNullOrWhiteSpace(model.CisternNumber) && isPlatform ? $"{model.WagonNumber} ({model.CisternNumber})" : model.WagonNumber;

        var dispName = !string.IsNullOrWhiteSpace(model.DispatcherName) ? model.DispatcherName : (!string.IsNullOrWhiteSpace(model.CreatedByName) ? model.CreatedByName : "Temir yo‘l sexi");
        var handoverName = !string.IsNullOrWhiteSpace(model.HandoverName) ? model.HandoverName : (!string.IsNullOrWhiteSpace(model.CreatedByName) ? model.CreatedByName : "Temir yo‘l sexi");
        var scaleName = !string.IsNullOrWhiteSpace(model.ScaleName) ? model.ScaleName : (!string.IsNullOrWhiteSpace(model.CreatedByName) ? model.CreatedByName : "Temir yo‘l sexi");

        var dispAt = model.DispatcherAt ?? approvedAt;
        var handoverAt = model.HandoverAt ?? approvedAt;
        var scaleAt = model.ScaleAt ?? approvedAt;

        var introText = $"\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Bizlar kim, ushbu dalolatnomani tuzib quyida imzo chekuvchilar SHGKM TYTT xizmati dispetcheri {dispName}, SHGKM TYTT xizmati vagonlarni qabul qiluvchi va topshiruvchisi {handoverName}, SHGKM TYTT xizmati {scaleRoleShort} {scaleName} lar ishtirokida tuzamiz, ushbu dalolatnomani shu haqdakim, quyidagi №  {wagonLine}  raqamli {noun} {reason} bo‘sh holatda zavod hududidan Kengsoy stansiyasiga chiqarish uchun tuzildi.";

        var signers = new List<(string Role, string Dept, DateTime At)>
        {
            ("TYTT xizmati dispetcheri", dispName, dispAt),
            (scaleRole, scaleName, scaleAt),
            ("TYTT xizmati vagonlarni qabul qiluvchi va topshiruvchisi", handoverName, handoverAt)
        };

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(12, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontSize(10.5f).FontFamily("Liberation Serif"));

                page.Header().Column(col =>
                {
                    col.Item().Row(r =>
                    {
                        r.RelativeItem().Text("E-TRANSPORT Axborot tizimi").Bold().FontSize(9.5f);
                        r.RelativeItem().AlignRight().Text("025-Ф6").FontSize(9.5f);
                    });

                    col.Item().PaddingTop(6).Row(r =>
                    {
                        r.RelativeItem(7).Row(leftRow =>
                        {
                            if (qrBytes.Length > 0)
                            {
                                leftRow.ConstantItem(60).Height(60).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(qrBytes);
                            }
                            leftRow.RelativeItem().PaddingLeft(10).AlignMiddle().Column(c =>
                            {
                                c.Spacing(4.5f);
                                c.Item().Text(t => { t.Span("Hujjat holati: ").Bold().FontSize(9.5f); t.Span("Tasdiqlangan").FontSize(9.5f); });
                                c.Item().Text(t => { t.Span("Hujjat raqami: ").Bold().FontSize(9.5f); t.Span(model.ActNumber).FontSize(9.5f); });
                                c.Item().Text(t => { t.Span("Tasdiqlangan sana/vaqt: ").Bold().FontSize(9.5f); t.Span(dateFormatted).FontSize(9.5f); });
                            });
                        });
                        r.RelativeItem(3);
                    });
                });

                page.Content().Column(col =>
                {
                    col.Item().PaddingTop(24).AlignCenter().Text("DALOLATNOMA").Bold().FontSize(13.5f);

                    col.Item().PaddingTop(14).Text(introText).FontSize(11f).LineHeight(1.65f);

                    col.Item().PaddingTop(22).Text("Ushbu dalolatnomani to‘g‘ri deb imzo chekuvchilar:").Bold().FontSize(11f);

                    col.Item().PaddingTop(10).Row(r1 =>
                    {
                        r1.Spacing(10);
                        for (int i = 0; i < signers.Count; i++)
                        {
                            var s = signers[i];
                            var qrPayload = $"Holat: Imzolandi\nBo'lim/sex: {s.Role}\nF.I.Sh.: {s.Dept}\nSana/vaqt: {s.At:dd.MM.yyyy HH:mm}";
                            var qrItemBytes = GenerateQrPngBytes(qrPayload);

                            r1.RelativeItem().Height(56).Layers(layers =>
                            {
                                layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 56' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='239' height='55' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                                layers.PrimaryLayer().PaddingVertical(5).PaddingHorizontal(6).Row(sr =>
                                {
                                    sr.RelativeItem().AlignMiddle().Column(sc =>
                                    {
                                        sc.Spacing(0.8f);
                                        sc.Item().Row(stRow =>
                                        {
                                            stRow.ConstantItem(10).Height(10).AlignMiddle().Svg(CheckCircleSvg);
                                            stRow.RelativeItem().PaddingLeft(3).AlignMiddle().Text("Imzolandi").FontColor(Colors.Green.Darken2).Bold().FontSize(8.5f);
                                        });
                                        sc.Item().Text(s.Role).FontSize(8f).FontColor(Colors.Grey.Darken3);
                                        sc.Item().Text(s.Dept).Bold().FontSize(8.5f);
                                        sc.Item().Text($"{s.At:dd.MM.yyyy HH:mm}").FontSize(8f).FontColor(Colors.Grey.Darken1);
                                    });
                                    if (qrItemBytes.Length > 0)
                                    {
                                        sr.ConstantItem(44).Height(44).AlignMiddle().Layers(ql =>
                                        {
                                            ql.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='100%' height='100%'><rect x='0' y='0' width='44' height='44' rx='4' ry='4' fill='#f1f5f9'/></svg>");
                                            ql.PrimaryLayer().Padding(1).Image(qrItemBytes);
                                        });
                                    }
                                });
                            });
                        }
                    });
                });

                page.Footer().Row(r =>
                {
                    r.RelativeItem().Text($"E-TRANSPORT Axborot tizimi | Dalolatnoma | {model.ArrivalNumber ?? "—"}").FontSize(8).FontColor(Colors.Grey.Darken1);
                    r.RelativeItem().AlignRight().Text(model.ActNumber).FontSize(8).FontColor(Colors.Grey.Darken1);
                });
            });
        });

        return doc.GeneratePdf();
    }

    public byte[] GenerateYukXatiPdf(YukXatiPdfModel model)
    {
        const string CheckCircleSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#16a34a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/></svg>";
        const string CheckedBoxSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2'/><path d='m8 12 3 3 5-5'/></svg>";
        const string UncheckedBoxSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2'/></svg>";

        static string FormatUzt(DateTime? dt)
        {
            if (!dt.HasValue) return "—";
            var uzt = dt.Value.Kind == DateTimeKind.Utc ? dt.Value.AddHours(5) : dt.Value;
            return $"{uzt:dd.MM.yyyy HH:mm}";
        }

        var mainQrTarget = !string.IsNullOrWhiteSpace(model.QrVerificationUrl)
            ? model.QrVerificationUrl
            : (!string.IsNullOrWhiteSpace(model.QrGlobalId)
                ? $"https://qrlink.sgcc.uz/verify/{model.QrGlobalId}"
                : $"https://qrlink.sgcc.uz/verify/{model.RegistryNumber}");

        var mainQrBytes = GenerateQrPngBytes(mainQrTarget);

        var shiftLeaderName = !string.IsNullOrWhiteSpace(model.ShiftLeaderName) ? model.ShiftLeaderName : (model.InspectorName ?? "Xayitov Anvarjon Karimovich");
        if (shiftLeaderName == "—") shiftLeaderName = "Xayitov Anvarjon Karimovich";
        var shiftApproved = model.ShiftLeaderAt != null || !string.IsNullOrWhiteSpace(model.InspectorName) || model.PermitOk;
        var shiftQrPayload = $"Holat: Tasdiqlandi\nBo'lim/sex: ICHDX smena boshlig'i\nF.I.Sh.: {shiftLeaderName}\nIshonchnoma raqami: 01-5/25-33 12.08.2026\nSana/vaqt: {FormatUzt(model.ShiftLeaderAt ?? model.PreparedAt)}";
        var shiftQrBytes = GenerateQrPngBytes(shiftQrPayload);

        decimal NormalizeKg(decimal w) => (w > 0 && w < 1000) ? Math.Round(w * 1000m, 0) : w;

        var totalTare = NormalizeKg(model.TotalTare > 0 ? model.TotalTare : model.Wagons.Sum(w => NormalizeKg(w.TareWeight)));
        var totalBrutto = NormalizeKg(model.TotalBrutto > 0 ? model.TotalBrutto : model.Wagons.Sum(w => NormalizeKg(w.BruttoWeight)));
        var totalNetto = NormalizeKg(model.TotalNetto > 0 ? model.TotalNetto : (model.Wagons.Sum(w => NormalizeKg(w.NettoWeight)) > 0 ? model.Wagons.Sum(w => NormalizeKg(w.NettoWeight)) : model.TotalNetto));

        var exitDisplay = model.ExitDate != null
            ? FormatUzt(model.ExitDate.Value)
            : FormatUzt(model.PreparedAt);

        var wagons = model.Wagons ?? new List<YukXatiPdfWagonRow>();
        const int singlePageMaxWagons = 4;
        const int firstPageLimitWithMultiPages = 4;
        const int continuationLimit = 14;
        const int continuationLimitWithSignatures = 7;

        bool signaturesOnFirstPage = wagons.Count <= singlePageMaxWagons;
        List<YukXatiPdfWagonRow> firstPageRows;
        var continuationPages = new List<List<YukXatiPdfWagonRow>>();

        if (signaturesOnFirstPage)
        {
            firstPageRows = wagons.ToList();
        }
        else
        {
            firstPageRows = wagons.Take(firstPageLimitWithMultiPages).ToList();
            var remainingRows = wagons.Skip(firstPageLimitWithMultiPages).ToList();

            if (remainingRows.Count == 0)
            {
                continuationPages.Add(new List<YukXatiPdfWagonRow>());
            }
            else
            {
                int offset = 0;
                while (offset < remainingRows.Count)
                {
                    int left = remainingRows.Count - offset;
                    bool isLastChunk = left <= continuationLimitWithSignatures;
                    int chunkSize = isLastChunk ? left : continuationLimit;
                    continuationPages.Add(remainingRows.Skip(offset).Take(chunkSize).ToList());
                    offset += chunkSize;
                }
                if (continuationPages.Count > 0 && continuationPages[^1].Count > continuationLimitWithSignatures)
                {
                    continuationPages.Add(new List<YukXatiPdfWagonRow>());
                }
            }
        }

        var signers = model.Signers ?? new List<YukXatiPdfSigner>
        {
            new("warehouse", "Tayyor mahsulotlar va xom ashyo sexi", "Yuklandi", model.PreparedByName, model.PreparedAt),
            new("scale", "Tarozi operatori", "Tarozida tortildi", model.PreparedByName, model.PreparedAt),
            new("economist", "ICHDX iqtisodchisi", "Yuk xati shakllantirildi", model.PreparedByName, model.PreparedAt),
            new("permit", "Ruxsatnoma byurosi xodimi", "Kelishildi", model.InspectorName, model.PreparedAt),
            new("security", "Qo‘riqlash xizmati (NO‘J) xodimi", "Kelishildi", model.SecurityOfficerName, model.PreparedAt)
        };

        void RenderWagonsTable(ColumnDescriptor col, List<YukXatiPdfWagonRow> rows)
        {
            col.Item().Table(tbl =>
            {
                tbl.ColumnsDefinition(c =>
                {
                    c.ConstantColumn(22);  // T/r
                    c.ConstantColumn(66);  // Vagon raqami
                    c.ConstantColumn(58);  // Tara
                    c.ConstantColumn(58);  // Brutto
                    c.ConstantColumn(58);  // Netto
                    c.ConstantColumn(72);  // Plomba raqami
                    c.ConstantColumn(68);  // Vagon turi
                    c.ConstantColumn(85);  // Mahsulot turi
                    c.RelativeColumn();    // Qabul qiluvchi va stansiya
                });

                tbl.Header(h =>
                {
                    void TH(string txt) => h.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(5.5f).PaddingHorizontal(2.5f).AlignCenter().AlignMiddle().Text(txt).Bold().FontSize(9.5f);
                    TH("T/r");
                    TH("Vagon raqami");
                    TH("Vagon og‘irligi\n(Tara), kg");
                    TH("Umumiy og‘irlik\n(Brutto), kg");
                    TH("Sof og‘irlik\n(Netto), kg");
                    TH("Plomba raqami");
                    TH("Vagon turi");
                    TH("Mahsulot turi");
                    TH("Qabul qiluvchi tashkilot va stansiya");
                });

                foreach (var w in rows)
                {
                    var isDefective = w.IsDefective || w.Status == "Returned" || (w.ReceiverAndStation?.Contains("Nomuvofiqlik") == true);
                    var wTare = NormalizeKg(w.TareWeight);
                    var wBrutto = NormalizeKg(w.BruttoWeight);
                    var wNetto = NormalizeKg(w.NettoWeight);
                    var wType = string.Equals(w.WagonType, "sisterna", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(w.WagonType) ? "Vagon-sisterna" : w.WagonType;

                    void TD(string txt, bool bold = false, bool isRed = false)
                    {
                        var cell = tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(7f).PaddingHorizontal(3f);
                        var text = cell.AlignCenter().AlignMiddle().Text(txt).FontSize(10.5f);
                        if (bold) text.Bold();
                        if (isRed) text.FontColor(Colors.Red.Darken2).Bold();
                    }

                    TD(w.Index.ToString());
                    TD(w.WagonNumber);
                    TD(!isDefective && wTare > 0 ? wTare.ToString("N0") : "—");
                    TD(!isDefective && wBrutto > 0 ? wBrutto.ToString("N0") : "—");
                    TD(!isDefective && wNetto > 0 ? wNetto.ToString("N0") : "—", bold: !isDefective && wNetto > 0);
                    TD(!isDefective && !string.IsNullOrWhiteSpace(w.SealNumbers) ? w.SealNumbers : "—");
                    TD(wType);
                    TD(w.ProductType ?? model.ProductType ?? "Suyultirilgan gaz");
                    TD(w.ReceiverAndStation ?? model.CustomerName ?? model.DestinationStation ?? "—", isRed: isDefective);
                }
            });
        }

        void RenderSignCard(RowDescriptor r, YukXatiPdfSigner s)
        {
            var isApproved = s.At.HasValue && !string.IsNullOrWhiteSpace(s.Name) && s.Name != "—" && s.Status != "Kutilmoqda";
            var sName = isApproved && !string.IsNullOrWhiteSpace(s.Name) ? s.Name : "—";
            var statusText = isApproved ? s.Status : "Kutilmoqda";
            var timeText = isApproved && s.At.HasValue ? FormatUzt(s.At.Value) : "—";

            byte[]? sQrBytes = null;
            if (isApproved)
            {
                var sQrPayload = $"Bo'lim/sex: {s.Department}\nHolat: {statusText}\nF.I.Sh.: {sName}\nSana/vaqt: {timeText}";
                sQrBytes = GenerateQrPngBytes(sQrPayload);
            }

            r.ConstantItem(195).Height(56).Layers(layers =>
            {
                var bgStroke = isApproved ? "#cbd5e1" : "#e2e8f0";
                layers.Layer().Svg($"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 195 56' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='194' height='55' rx='6' ry='6' fill='#ffffff' stroke='{bgStroke}' stroke-width='1'/></svg>");

                layers.PrimaryLayer().PaddingVertical(5).PaddingHorizontal(6).Row(sr =>
                {
                    sr.RelativeItem().AlignMiddle().Column(sc =>
                    {
                        sc.Spacing(0.8f);
                        sc.Item().Row(statusRow =>
                        {
                            if (isApproved)
                            {
                                statusRow.ConstantItem(10).Height(10).AlignMiddle().Svg(CheckCircleSvg);
                                statusRow.RelativeItem().PaddingLeft(3).AlignMiddle().Text(statusText).Bold().FontSize(8.5f).FontColor(Colors.Green.Darken2);
                            }
                            else
                            {
                                statusRow.RelativeItem().AlignMiddle().Text(statusText).Bold().FontSize(8.5f).FontColor(Colors.Grey.Medium);
                            }
                        });
                        sc.Item().Text(s.Department).FontSize(8f).FontColor(Colors.Grey.Darken3);
                        sc.Item().Text(sName).Bold().FontSize(8.5f);
                        sc.Item().Text(timeText).FontSize(8f).FontColor(Colors.Grey.Darken1);
                    });
                    if (sQrBytes != null && sQrBytes.Length > 0)
                    {
                        sr.ConstantItem(44).Height(44).AlignMiddle().Layers(ql =>
                        {
                            ql.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='100%' height='100%'><rect x='0' y='0' width='44' height='44' rx='4' ry='4' fill='#f1f5f9'/></svg>");
                            ql.PrimaryLayer().Padding(1).Image(sQrBytes);
                        });
                    }
                    else
                    {
                        sr.ConstantItem(44).Height(44).AlignMiddle().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='100%' height='100%'><rect x='0.5' y='0.5' width='43' height='43' rx='4' ry='4' fill='#f8fafc' stroke='#cbd5e1' stroke-width='1' stroke-dasharray='2,2'/><text x='22' y='26' font-size='10' font-family='sans-serif' fill='#94a3b8' text-anchor='middle'>QR</text></svg>");
                    }
                });
            });
        }

        void RenderSignatures(ColumnDescriptor col)
        {
            col.Item().PaddingTop(6).AlignCenter().Column(cardsCol =>
            {
                cardsCol.Spacing(5);

                // 1-qator: 3 ta kartochka
                cardsCol.Item().Row(r1 =>
                {
                    if (signers.Count > 0) RenderSignCard(r1, signers[0]);
                    r1.ConstantItem(10);
                    if (signers.Count > 1) RenderSignCard(r1, signers[1]);
                    r1.ConstantItem(10);
                    if (signers.Count > 2) RenderSignCard(r1, signers[2]);
                });

                // 2-qator: 2 ta kartochka + 1 ta bo'sh spacer
                if (signers.Count > 3)
                {
                    cardsCol.Item().Row(r2 =>
                    {
                        RenderSignCard(r2, signers[3]);
                        r2.ConstantItem(10);
                        if (signers.Count > 4) RenderSignCard(r2, signers[4]);
                        else r2.ConstantItem(195);
                        r2.ConstantItem(10);
                        r2.ConstantItem(195); // 3-ustun bo'sh joy
                    });
                }
            });
        }

        try
        {
            var doc = Document.Create(container =>
            {
                // Page 1
                container.Page(page =>
                {
                    page.Size(PageSizes.A4.Landscape());
                    page.Margin(8, Unit.Millimetre);
                    page.DefaultTextStyle(x => x.FontSize(8).FontFamily("Liberation Serif"));

                    page.Header().Column(col =>
                    {
                        col.Item().Row(r =>
                        {
                            r.RelativeItem().Text("E-TRANSPORT Axborot tizimi").Bold().FontSize(8.5f);
                            r.RelativeItem().AlignRight().Text("025-Ф5").Bold().FontSize(8.5f);
                        });
                    });

                    page.Content().Column(col =>
                    {
                        col.Spacing(3);

                        col.Item().AlignCenter().Column(c =>
                        {
                            c.Spacing(3.5f);
                            c.Item().AlignCenter().Text("YUK XATI").Bold().FontSize(14f);
                            c.Item().AlignCenter().Text("BIR YUK XATI BILAN RASMIYLASHTIRILGAN VAGONLAR").Bold().FontSize(10.5f);
                            c.Item().AlignCenter().Text($"REESTRI № {model.RegistryNumber}").Bold().FontSize(10.5f);
                        });

                        col.Item().Row(r =>
                        {
                            // Chap QR blok (60x60 kvadrat chiziq ichida)
                            r.RelativeItem().AlignMiddle().Row(leftRow =>
                            {
                                if (mainQrBytes.Length > 0)
                                {
                                    leftRow.ConstantItem(60).Height(60).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(mainQrBytes);
                                }
                                leftRow.RelativeItem().PaddingLeft(10).AlignMiddle().Column(c =>
                                {
                                    c.Spacing(3.5f);
                                    c.Item().Text(t => { t.Span("Hujjat holati: ").Bold().FontSize(9.5f); t.Span(model.PermitOk ? "Tasdiqlangan" : "Jarayonda").FontSize(9.5f); });
                                    c.Item().Text(t => { t.Span("Yuklash topshirig‘i №: ").Bold().FontSize(9.5f); t.Span(model.LoadingTaskNo ?? "—").FontSize(9.5f); });
                                    c.Item().Text(t => { t.Span("Yukni chiqarish sanasi: ").Bold().FontSize(9.5f); t.Span(exitDisplay).FontSize(9.5f); });
                                    c.Item().Text(t => { t.Span("Shartnoma №: ").Bold().FontSize(9.5f); t.Span(model.ContractNo ?? "01-36/22-44").FontSize(9.5f); });
                                });
                            });

                            // O'ng QR blok (Bosh direktor shtampi kartochkasi 190x66, QR 58x58 kvadrat chiziq ichida)
                            r.ConstantItem(190).Height(66).Layers(layers =>
                            {
                                layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 190 66' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='189' height='65' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                                layers.PrimaryLayer().Padding(4).Row(rightRow =>
                                {
                                    rightRow.RelativeItem().AlignMiddle().Column(c =>
                                    {
                                        c.Spacing(3f);
                                        c.Item().AlignRight().PaddingRight(5).Text("Bosh direktor").Bold().FontSize(9f);
                                        c.Item().AlignRight().PaddingRight(5).Text("Sh. Aslanov").Bold().FontSize(9f);
                                        c.Item().AlignRight().PaddingRight(5).Text(shiftApproved ? "TASDIQLANDI" : "KUTILMOQDA").Bold().FontSize(9f).FontColor(shiftApproved ? Colors.Green.Darken2 : Colors.Amber.Darken2);
                                    });
                                    if (shiftQrBytes.Length > 0)
                                    {
                                        rightRow.ConstantItem(58).Height(58).AlignMiddle().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(shiftQrBytes);
                                    }
                                });
                            });
                        });

                        col.Item().Table(tbl =>
                        {
                            tbl.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(16);
                                c.RelativeColumn(21);
                                c.RelativeColumn(21);
                                c.RelativeColumn(21);
                                c.RelativeColumn(21);
                            });

                            void CellTxt(string label, string val, bool boldVal = true)
                            {
                                tbl.Cell().ColumnSpan(5).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4.5f).PaddingHorizontal(3f).Column(c =>
                                {
                                    c.Item().AlignCenter().Text(label).FontSize(9.75f).FontColor(Colors.Grey.Darken3);
                                    var t = c.Item().AlignCenter().Text(val).FontSize(11f);
                                    if (boldVal) t.Bold();
                                });
                            }

                            CellTxt("Jo‘natuvchi tashkilot", model.ConsignorName ?? "\"SHURTAN GAZ KIMYO MAJMUASI\" MCHJ", true);
                            CellTxt("Yuk jo‘natuvchi stansiya", model.ConsignorStation ?? "732602 - KENGSOY", true);
                            CellTxt("Yuklash joyi / jo‘natuvchi manzili", model.ConsignorAddress ?? "Qashqadaryo viloyati, G'uzor tumani, Shurtan qo'rg'oni", false);

                            tbl.Cell().ColumnSpan(2).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4.5f).PaddingHorizontal(3f).Row(tr =>
                            {
                                tr.AutoItem().AlignMiddle().Text("Transport turi: ").FontSize(9.5f);
                                tr.ConstantItem(10f).Height(10f).AlignMiddle().Svg(CheckedBoxSvg);
                                tr.AutoItem().PaddingLeft(2).PaddingRight(6).AlignMiddle().Text("Temir yo‘l").Bold().FontSize(9.5f);
                                tr.ConstantItem(10f).Height(10f).AlignMiddle().Svg(UncheckedBoxSvg);
                                tr.AutoItem().PaddingLeft(2).AlignMiddle().Text("Avtomobil").FontSize(9.5f);
                            });

                            tbl.Cell().ColumnSpan(3).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4.5f).PaddingHorizontal(3f).Row(mr =>
                            {
                                mr.AutoItem().AlignMiddle().Text("Jo‘natishga moliyaviy ruxsat: ").FontSize(9.5f);
                                mr.ConstantItem(10f).Height(10f).AlignMiddle().Svg(model.PermitOk ? CheckedBoxSvg : UncheckedBoxSvg);
                                mr.AutoItem().PaddingLeft(2).PaddingRight(6).AlignMiddle().Text("Berildi").Bold().FontSize(9.5f);
                                mr.ConstantItem(10f).Height(10f).AlignMiddle().Svg(model.PermitDenied ? CheckedBoxSvg : UncheckedBoxSvg);
                                mr.AutoItem().PaddingLeft(2).AlignMiddle().Text("Berilmadi").FontSize(9.5f);
                            });

                            // Jami massalar 2-qatorli header
                            tbl.Cell().RowSpan(2).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4f).AlignCenter().AlignMiddle()
                                .Text("Vagonlar\nsoni").Bold().FontSize(9f);
                            tbl.Cell().ColumnSpan(3).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4f).AlignCenter().AlignMiddle()
                                .Text("Jami yuk massasi, kg").Bold().FontSize(9.5f);
                            tbl.Cell().RowSpan(2).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4f).AlignCenter().AlignMiddle()
                                .Text("Yuklash usuli").Bold().FontSize(9f);

                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4f).AlignCenter().AlignMiddle()
                                .Text("Vagon og‘irligi\n(Tara)").Bold().FontSize(9f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4f).AlignCenter().AlignMiddle()
                                .Text("Umumiy og‘irlik\n(Brutto)").Bold().FontSize(9f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(4f).AlignCenter().AlignMiddle()
                                .Text("Sof og‘irlik\n(Netto)").Bold().FontSize(9f);

                            // Massalar qiymatlari
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(5.5f).AlignCenter().AlignMiddle()
                                .Text(model.WagonCount.ToString()).Bold().FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(5.5f).AlignCenter().AlignMiddle()
                                .Text(totalTare > 0 ? totalTare.ToString("N0") : "—").Bold().FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(5.5f).AlignCenter().AlignMiddle()
                                .Text(totalBrutto > 0 ? totalBrutto.ToString("N0") : "—").Bold().FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(5.5f).AlignCenter().AlignMiddle()
                                .Text(totalNetto > 0 ? totalNetto.ToString("N0") : "—").Bold().FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).PaddingVertical(5.5f).AlignCenter().AlignMiddle()
                                .Text("Nasos orqali quyish").Bold().FontSize(9.5f);
                        });

                        RenderWagonsTable(col, firstPageRows);

                        if (signaturesOnFirstPage)
                        {
                            RenderSignatures(col);
                        }
                    });

                    page.Footer().Row(r =>
                    {
                        r.RelativeItem().Text("E-TRANSPORT Axborot tizimi | Yuk xati shakli | “Shurtan gaz kimyo majmuasi” MChJ").FontSize(7).FontColor(Colors.Grey.Darken1);
                        r.RelativeItem().AlignRight().Text(x =>
                        {
                            x.CurrentPageNumber().FontSize(7);
                            x.Span(" / ").FontSize(7);
                            x.TotalPages().FontSize(7);
                        });
                    });
                });

                // Continuation Pages
                for (int p = 0; p < continuationPages.Count; p++)
                {
                    var pRows = continuationPages[p];
                    bool isLastPage = p == continuationPages.Count - 1;

                    container.Page(page =>
                    {
                        page.Size(PageSizes.A4.Landscape());
                        page.Margin(8, Unit.Millimetre);
                        page.DefaultTextStyle(x => x.FontSize(8).FontFamily("Liberation Serif"));

                        page.Header().PaddingBottom(24).Row(r =>
                        {
                            r.RelativeItem().Text("E-TRANSPORT Axborot tizimi").Bold().FontSize(8.5f);
                            r.RelativeItem().AlignRight().Text("025-Ф5").Bold().FontSize(8.5f);
                        });

                        page.Content().Column(col =>
                        {
                            col.Spacing(8);

                            if (pRows.Count > 0)
                            {
                                RenderWagonsTable(col, pRows);
                            }

                            if (isLastPage)
                            {
                                RenderSignatures(col);
                            }
                        });

                        page.Footer().Row(r =>
                        {
                            r.RelativeItem().Text("E-TRANSPORT Axborot tizimi | Yuk xati shakli | “Shurtan gaz kimyo majmuasi” MChJ").FontSize(7).FontColor(Colors.Grey.Darken1);
                            r.RelativeItem().AlignRight().Text(x =>
                            {
                                x.CurrentPageNumber().FontSize(7);
                                x.Span(" / ").FontSize(7);
                                x.TotalPages().FontSize(7);
                            });
                        });
                    });
                }
            });

            return doc.GeneratePdf();
        }
        catch
        {
            var fallbackDoc = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4.Landscape());
                    page.Margin(12, Unit.Millimetre);
                    page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Liberation Serif"));
                    page.Header().Row(r =>
                    {
                        r.RelativeItem().Text("E-TRANSPORT Axborot tizimi").Bold().FontSize(10);
                        r.RelativeItem().AlignRight().Text($"Yuk xati № {model.RegistryNumber}").Bold().FontSize(10);
                    });
                    page.Content().PaddingTop(8).Column(c =>
                    {
                        c.Spacing(6);
                        c.Item().AlignCenter().Text($"YUK XATI № {model.RegistryNumber}").Bold().FontSize(13);
                        c.Item().Text($"Xaridor: {model.CustomerName ?? "—"} | Stansiya: {model.DestinationStation ?? "—"} | Mahsulot: {model.ProductType ?? "—"}");
                        c.Item().Text($"Vagonlar soni: {model.WagonCount} ta | Jami Netto: {model.TotalNetto:N0} kg | Sana: {FormatUzt(model.PreparedAt)}");
                        c.Item().Table(tbl =>
                        {
                            tbl.ColumnsDefinition(cd =>
                            {
                                cd.ConstantColumn(25);
                                cd.RelativeColumn(2);
                                cd.RelativeColumn(2);
                                cd.RelativeColumn(2);
                                cd.RelativeColumn(2);
                                cd.RelativeColumn(3);
                            });
                            tbl.Header(h =>
                            {
                                void H(string t) => h.Cell().Border(1).Background(Colors.Grey.Lighten3).Padding(2).AlignCenter().Text(t).Bold().FontSize(8);
                                H("№"); H("Vagon"); H("Tara"); H("Brutto"); H("Netto"); H("Qabul qiluvchi");
                            });
                            foreach (var w in model.Wagons)
                            {
                                void D(string t, bool center = false)
                                {
                                    var cell = tbl.Cell().Border(1).Padding(2);
                                    if (center) cell.AlignCenter().Text(t).FontSize(8);
                                    else cell.Text(t).FontSize(8);
                                }
                                D(w.Index.ToString(), true);
                                D(w.WagonNumber, true);
                                D(w.TareWeight > 0 ? w.TareWeight.ToString("N0") : "—");
                                D(w.BruttoWeight > 0 ? w.BruttoWeight.ToString("N0") : "—");
                                D(w.NettoWeight > 0 ? w.NettoWeight.ToString("N0") : "—");
                                D(w.ReceiverAndStation ?? model.CustomerName ?? "—");
                            }
                        });
                    });
                    page.Footer().AlignCenter().Text("E-Transport tizimida shakllantirilgan elektron hujjat").FontSize(8).FontColor(Colors.Grey.Darken1);
                });
            });
            return fallbackDoc.GeneratePdf();
        }
    }

    public byte[] GenerateEntryPermitPdf(EntryPermitPdfModel model)
    {
        var mainQrTarget = !string.IsNullOrWhiteSpace(model.QrVerificationUrl)
            ? model.QrVerificationUrl
            : (!string.IsNullOrWhiteSpace(model.QrGlobalId)
                ? $"https://qrlink.sgcc.uz/verify/{model.QrGlobalId}"
                : $"https://qrlink.sgcc.uz/verify/{model.PermitNumber}");

        var mainQrBytes = GenerateQrPngBytes(mainQrTarget);

        const string directorName = "Sh. Aslanov";
        var shiftLeaderName = !string.IsNullOrWhiteSpace(model.ShiftLeaderName) && model.ShiftLeaderName != "—" && model.ShiftLeaderName != "Sh. Aslanov" ? model.ShiftLeaderName : "Xayitov Anvarjon Karimovich";
        var shiftApproved = model.ShiftLeaderApproved || model.ShiftLeaderAt != null || !string.IsNullOrWhiteSpace(model.ShiftLeaderName);
        var shiftQrPayload = $"Holat: Tasdiqlandi\nBo'lim/sex: ICHDX smena boshlig'i\nF.I.Sh.: {shiftLeaderName}\nIshonchnoma raqami: 01-5/25-33 12.08.2026\nSana/vaqt: {(model.ShiftLeaderAt ?? model.CreatedAt):dd.MM.yyyy HH:mm}";
        var shiftQrBytes = GenerateQrPngBytes(shiftQrPayload);

        var approvedAt = model.ApprovedAt ?? model.SecurityOfficerAt ?? model.PermitOfficerAt ?? model.ShiftLeaderAt ?? model.CreatedAt;
        var dateFormatted = $"{approvedAt:dd.MM.yyyy HH:mm}";

        var isDone = model.IsDone || (model.PermitOfficerAt != null && model.SecurityOfficerAt != null);

        try
        {
            var doc = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.MarginVertical(8, Unit.Millimetre);
                    page.MarginHorizontal(14, Unit.Millimetre);
                    page.DefaultTextStyle(x => x.FontSize(8).FontFamily("Liberation Serif"));

                    page.Header().Row(r =>
                    {
                        r.RelativeItem().Text("E-TRANSPORT Axborot tizimi").Bold().FontSize(8.5f);
                        r.RelativeItem().AlignRight().Text("025-Ф6").Bold().FontSize(8.5f);
                    });

                    page.Content().Column(col =>
                    {
                        col.Item().PaddingTop(8).Row(r =>
                        {
                            // Chap QR blok (60x60 kvadrat chiziq ichida)
                            r.RelativeItem().AlignMiddle().Row(leftRow =>
                            {
                                if (mainQrBytes.Length > 0)
                                {
                                    leftRow.ConstantItem(60).Height(60).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(mainQrBytes);
                                }
                                leftRow.RelativeItem().PaddingLeft(10).AlignMiddle().Column(c =>
                                {
                                    c.Spacing(4.5f);
                                    c.Item().Text(t => { t.Span("Hujjat holati: ").Bold().FontSize(9.5f); t.Span(isDone ? "Tasdiqlangan" : "Kelishuvda").FontSize(9.5f); });
                                    c.Item().Text(t => { t.Span("Hujjat raqami: ").Bold().FontSize(9.5f); t.Span(model.PermitNumber).FontSize(9.5f); });
                                    c.Item().Text(t => { t.Span("Tasdiqlangan vaqt: ").Bold().FontSize(9.5f); t.Span(dateFormatted).FontSize(9.5f); });
                                });
                            });

                            // O'ng QR blok (Bosh direktor shtampi kartochkasi 190x66, QR 58x58 kvadrat chiziq ichida)
                            r.ConstantItem(190).Height(66).Layers(layers =>
                            {
                                layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 190 66' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='189' height='65' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                                layers.PrimaryLayer().Padding(4).Row(rightRow =>
                                {
                                    rightRow.RelativeItem().AlignMiddle().Column(c =>
                                    {
                                        c.Spacing(3f);
                                        c.Item().AlignRight().PaddingRight(5).Text("Bosh direktor").Bold().FontSize(9f);
                                        c.Item().AlignRight().PaddingRight(5).Text(directorName).Bold().FontSize(9f);
                                        c.Item().AlignRight().PaddingRight(5).Text(shiftApproved ? "TASDIQLANDI" : "KUTILMOQDA").Bold().FontSize(9f).FontColor(shiftApproved ? Colors.Green.Darken2 : Colors.Amber.Darken2);
                                    });
                                    if (shiftQrBytes.Length > 0)
                                    {
                                        rightRow.ConstantItem(58).Height(58).AlignMiddle().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(shiftQrBytes);
                                    }
                                });
                            });
                        });

                        col.Item().PaddingTop(16).AlignCenter().Text("X I Z M A T   X A T I").Bold().FontSize(14f);
                        col.Item().PaddingTop(8).Text("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Quyidagi raqamlari ko‘rsatilgan bo‘sh vagonlarni yuk yuklash uchun zavod hududiga kiritishga ruxsat berishingizni so‘rayman.").FontSize(10.5f);

                        string FormatWagonKind(string? type)
                        {
                            if (string.IsNullOrWhiteSpace(type)) return "Vagon-sisterna";
                            var t = type.Trim().ToLowerInvariant();
                            if (t == "sisterna" || t == "cistern" || t == "vagon-sisterna" || t == "sist") return "Vagon-sisterna";
                            if (t == "polietilen" || t == "platforma" || t == "ochiq vagon") return "Platforma (ochiq vagon)";
                            if (t == "yopiq" || t == "yopiq vagon") return "Yopiq vagon";
                            return type;
                        }

                        col.Item().PaddingTop(10).Table(tbl =>
                        {
                            tbl.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(32);  // №
                                c.RelativeColumn(2);   // Vagon raqami
                                c.RelativeColumn(2);   // Vagon turi
                                c.RelativeColumn(2);   // Yuk nomi
                            });

                            tbl.Header(h =>
                            {
                                void TH(string txt) => h.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.Grey.Lighten4).PaddingVertical(7f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(txt).Bold().FontSize(10.5f);
                                TH("№");
                                TH("Vagon raqami");
                                TH("Vagon turi");
                                TH("Yuk nomi");
                            });

                            foreach (var w in model.Wagons)
                            {
                                void TD(string txt)
                                {
                                    tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(txt).FontSize(10.5f);
                                }

                                TD(w.Index.ToString());
                                TD(w.WagonNumber);
                                TD(FormatWagonKind(w.WagonType));
                                TD(!string.IsNullOrWhiteSpace(w.ProductType) ? w.ProductType : (model.ProductType ?? "Suyultirilgan gaz"));
                            }
                        });

                        // 3 ta imzo kartochkasi
                        var signers = model.Signers ?? new List<EntryPermitPdfSigner>
                        {
                            new("railway", "Temir yo‘l operatori", "Yaratildi", model.CreatedByName, model.CreatedAt),
                            new("permit", "Ruxsatnoma byurosi xodimi", "Ruxsat etildi", model.PermitOfficerName, model.PermitOfficerAt ?? model.CreatedAt),
                            new("security", "Qo‘riqlash xizmati (NO‘J) xodimi", "Ruxsat etildi", model.SecurityOfficerName, model.SecurityOfficerAt ?? model.CreatedAt)
                        };

                        void RenderSignCard(RowDescriptor r, EntryPermitPdfSigner s)
                        {
                            var sRole = s.Key == "railway" ? "Temir yo‘l operatori" : (s.Key == "permit" ? "Ruxsatnoma byurosi xodimi" : "Qo‘riqlash xizmati (NO‘J) xodimi");
                            var sName = !string.IsNullOrWhiteSpace(s.Name) && s.Name != sRole && s.Name != "Ruxsatnoma byurosi" && s.Name != "Qo'riqlash xizmati" && s.Name != "Qo‘riqlash xizmati" && !s.Name.Contains("xizmati") && !s.Name.Contains("byurosi") ? s.Name : "—";
                            var sQrPayload = $"Bo'lim/sex: {sRole}\nHolat: {s.Status}\nF.I.Sh.: {sName}\nSana/vaqt: {(s.At ?? model.CreatedAt):dd.MM.yyyy HH:mm:ss}";
                            var sQrBytes = GenerateQrPngBytes(sQrPayload);

                            r.ConstantItem(195).Height(56).Layers(layers =>
                            {
                                layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 195 56' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='194' height='55' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                                layers.PrimaryLayer().PaddingVertical(5).PaddingHorizontal(6).Row(sr =>
                                {
                                    sr.RelativeItem().AlignMiddle().Column(sc =>
                                    {
                                        sc.Spacing(0.8f);
                                        sc.Item().Row(stRow =>
                                        {
                                            stRow.ConstantItem(10).Height(10).AlignMiddle().Svg(CheckCircleSvg);
                                            stRow.RelativeItem().PaddingLeft(3).AlignMiddle().Text(s.Status).FontColor(Colors.Green.Darken2).Bold().FontSize(8.5f);
                                        });
                                        sc.Item().Text(sRole).FontSize(8f).FontColor(Colors.Grey.Darken3);
                                        sc.Item().Text(sName).Bold().FontSize(8.5f);
                                        sc.Item().Text($"{(s.At ?? model.CreatedAt):dd.MM.yyyy HH:mm}").FontSize(8f).FontColor(Colors.Grey.Darken1);
                                    });
                                    if (sQrBytes.Length > 0)
                                    {
                                        sr.ConstantItem(44).Height(44).AlignMiddle().Layers(ql =>
                                        {
                                            ql.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='100%' height='100%'><rect x='0' y='0' width='44' height='44' rx='4' ry='4' fill='#f1f5f9'/></svg>");
                                            ql.PrimaryLayer().Padding(1).Image(sQrBytes);
                                        });
                                    }
                                });
                            });
                        }

                        col.Item().PaddingTop(14).AlignCenter().Column(cardsCol =>
                        {
                            cardsCol.Spacing(6);

                            // 1-qator: 2 ta kartochka
                            cardsCol.Item().Row(r1 =>
                            {
                                r1.Spacing(10);
                                if (signers.Count > 0) RenderSignCard(r1, signers[0]);
                                if (signers.Count > 1) RenderSignCard(r1, signers[1]);
                            });

                            // 2-qator: 3-kartochka
                            if (signers.Count > 2)
                            {
                                cardsCol.Item().Row(r2 =>
                                {
                                    r2.Spacing(10);
                                    RenderSignCard(r2, signers[2]);
                                    r2.ConstantItem(195).Text("");
                                });
                            }
                        });
                    });

                    page.Footer().Row(r =>
                    {
                        r.RelativeItem().Text("E-TRANSPORT Axborot tizimi | Xizmat xati").FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                        r.RelativeItem().AlignRight().Text(model.PermitNumber).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                    });
                });
            });

            return doc.GeneratePdf();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[GenerateEntryPermitPdf Exception] {ex}");
            throw;
        }
    }

    public byte[] GenerateMonthlyOrderPdf(MonthlyOrderPdfModel model)
    {
        const string CheckCircleSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#16a34a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/></svg>";

        static string FormatUzt(DateTime? dt)
        {
            if (!dt.HasValue) return "—";
            var uzt = dt.Value.Kind == DateTimeKind.Utc ? dt.Value.AddHours(5) : dt.Value;
            return $"{uzt:dd.MM.yyyy HH:mm}";
        }

        static string FormatShortName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "U. Isayev";
            var parts = name.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 1) return parts[0];
            if (parts.Length >= 2)
            {
                if (parts[0].Length <= 2 && parts[0].EndsWith('.')) return $"{parts[0]} {parts[1]}";
                if (parts[1].Length <= 2 && parts[1].EndsWith('.')) return $"{parts[1]} {parts[0]}";
                return $"{parts[1][0]}. {parts[0]}";
            }
            return name;
        }

        var mainQrTarget = !string.IsNullOrWhiteSpace(model.QrVerificationUrl)
            ? model.QrVerificationUrl
            : (!string.IsNullOrWhiteSpace(model.QrGlobalId)
                ? $"https://qrlink.sgcc.uz/verify/{model.QrGlobalId}"
                : $"https://qrlink.sgcc.uz/verify/{model.OrderNumber}");

        var mainQrBytes = GenerateQrPngBytes(mainQrTarget);

        var deputyName = !string.IsNullOrWhiteSpace(model.DeputyApproverName) ? model.DeputyApproverName : "U. Isayev";
        var deputyApproved = model.DeputyApprovedAt != null;
        var deputyQrPayload = $"Holat: Tasdiqlandi\nBo'lim/sex: Bosh direktor o'rinbosari\nF.I.Sh.: {FormatShortName(deputyName)}\nIshonchnoma raqami: 01-5/25-33 12.08.2026\nSana/vaqt: {FormatUzt(model.DeputyApprovedAt ?? model.ApprovedAt ?? DateTime.UtcNow)}";
        var deputyQrBytes = deputyApproved ? GenerateQrPngBytes(deputyQrPayload) : Array.Empty<byte>();

        var isCondensate = model.ProductType.Contains("kondensat", StringComparison.OrdinalIgnoreCase);
        var creatorRoleTitle = isCondensate ? "IChDX boshlig‘i" : "MS va MX boshlig‘i";
        var marketingName = !string.IsNullOrWhiteSpace(model.MarketingApproverName) ? model.MarketingApproverName : (isCondensate ? "IChDX boshlig‘i" : "Normurodov Bekzod Kenjayevich");
        var marketingAt = model.MarketingApprovedAt ?? model.ApprovedAt ?? DateTime.UtcNow;
        var marketingQrPayload = $"Bo'lim/sex: {creatorRoleTitle}\nHolat: Yaratildi\nF.I.Sh.: {marketingName}\nSana/vaqt: {FormatUzt(marketingAt)}";
        var marketingQrBytes = GenerateQrPngBytes(marketingQrPayload);

        var accountingName = !string.IsNullOrWhiteSpace(model.AccountingApproverName) ? model.AccountingApproverName : "Nazarov Xudoyqul Zamonovich";
        var accountingAt = model.AccountingApprovedAt ?? model.ApprovedAt ?? DateTime.UtcNow;
        var accountingQrPayload = $"Bo'lim/sex: Buxgalteriya\nHolat: Kelishildi\nF.I.Sh.: {accountingName}\nSana/vaqt: {FormatUzt(accountingAt)}";
        var accountingQrBytes = GenerateQrPngBytes(accountingQrPayload);

        var approvedAtFormatted = model.ApprovedAt != null ? FormatUzt(model.ApprovedAt.Value) : (model.DeputyApprovedAt != null ? FormatUzt(model.DeputyApprovedAt.Value) : "—");

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(8, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontSize(8).FontFamily("Liberation Serif"));

                page.Header().Column(col =>
                {
                    col.Item().Row(r =>
                    {
                        r.RelativeItem().Text("E-TRANSPORT Axborot tizimi").Bold().FontSize(8.5f);
                        r.RelativeItem().AlignRight().Text("Mahsulotlarni yuklash hujjati").FontSize(8.5f);
                    });

                    col.Item().PaddingTop(2).AlignCenter().Column(tc =>
                    {
                        tc.Spacing(3.5f);
                        tc.Item().AlignCenter().Text("MAHSULOTLARNI YUKLASH UCHUN").Bold().FontSize(14f);
                        tc.Item().AlignCenter().Text("BUYURTMA").Bold().FontSize(14f);
                        tc.Item().AlignCenter().Text($"№ {model.OrderNumber}").Bold().FontSize(10.5f);
                    });

                    col.Item().PaddingTop(3).Row(r =>
                    {
                        // Chap QR blok (60x60 kvadrat chiziq ichida)
                        r.RelativeItem().AlignMiddle().Row(metaRow =>
                        {
                            if (mainQrBytes.Length > 0)
                            {
                                metaRow.ConstantItem(60).Height(60).Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(mainQrBytes);
                            }
                            metaRow.RelativeItem().PaddingLeft(10).AlignMiddle().Column(mc =>
                            {
                                mc.Spacing(4.5f);
                                mc.Item().Text(t =>
                                {
                                    t.Span("Hujjat holati: ").Bold().FontSize(9.5f);
                                    t.Span(model.Status == "Active" || model.Status == "Completed" || model.Status == "Approved" || deputyApproved ? "Tasdiqlangan" : "Kelishuvda").FontSize(9.5f);
                                });
                                mc.Item().Text(t =>
                                {
                                    t.Span("Tasdiqlangan sana/vaqt: ").Bold().FontSize(9.5f);
                                    t.Span(approvedAtFormatted).FontSize(9.5f);
                                });
                                mc.Item().Text(t =>
                                {
                                    t.Span("Mahsulot turi: ").Bold().FontSize(9.5f);
                                    t.Span(model.ProductType ?? "—").FontSize(9.5f);
                                });
                            });
                        });

                        // O'ng QR blok (Bosh direktor o'rinbosari kartochkasi 190x66, QR 58x58 kvadrat chiziq ichida)
                        r.ConstantItem(190).Height(66).Layers(layers =>
                        {
                            layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 190 66' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='189' height='65' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                            layers.PrimaryLayer().Padding(4).Row(depRow =>
                            {
                                depRow.RelativeItem().AlignMiddle().Column(dc =>
                                {
                                    dc.Spacing(3f);
                                    dc.Item().AlignRight().PaddingRight(5).Text("Bosh direktor o‘rinbosari").Bold().FontSize(9f);
                                    dc.Item().AlignRight().PaddingRight(5).Text(FormatShortName(deputyName)).Bold().FontSize(9f);
                                    dc.Item().AlignRight().PaddingRight(5).Text(deputyApproved ? "TASDIQLANDI" : "KUTILMOQDA").Bold().FontSize(9f).FontColor(deputyApproved ? Colors.Green.Darken2 : Colors.Amber.Darken2);
                                });
                                if (deputyQrBytes.Length > 0)
                                {
                                    depRow.ConstantItem(58).Height(58).AlignMiddle().Border(0.6f).BorderColor(Colors.Black).Background(Colors.White).Padding(2).Image(deputyQrBytes);
                                }
                            });
                        });
                    });
                });

                page.Content().Column(col =>
                {
                    col.Item().PaddingTop(6).Table(tbl =>
                    {
                        tbl.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(30);
                            columns.RelativeColumn(3.5f);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(2f);
                            columns.RelativeColumn(2.5f);
                        });

                        tbl.Header(h =>
                        {
                            void H(string text) => h.Cell().Border(0.6f).BorderColor(Colors.Black).Background(Colors.Grey.Lighten4).PaddingVertical(7f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(text).Bold().FontSize(10.5f);
                            H("№");
                            H("Korxona (kontragent) nomi");
                            H("Vagon soni");
                            H("Og'irligi (t)");
                            H("Shartnoma raqami");
                            H("Yetkazib berish joyi (stansiya)");
                        });

                        var contractNo = !string.IsNullOrWhiteSpace(model.ContractNumber) ? model.ContractNumber : (model.Lines.FirstOrDefault(l => !string.IsNullOrWhiteSpace(l.ContractNumber))?.ContractNumber ?? "1231234");

                        for (int i = 0; i < model.Lines.Count; i++)
                        {
                            var line = model.Lines[i];

                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text((i + 1).ToString()).FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(6).AlignLeft().AlignMiddle().Text(line.Contractor).FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(line.WagonCount > 0 ? line.WagonCount.ToString() : "—").FontSize(10.5f);
                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(line.TonCount > 0 ? line.TonCount.ToString("0.###") : "—").FontSize(10.5f);

                            if (i == 0)
                            {
                                tbl.Cell().RowSpan((uint)Math.Max(1, model.Lines.Count)).Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(contractNo).FontSize(10.5f);
                            }

                            tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(line.DestinationStation ?? "—").FontSize(10.5f);
                        }

                        // JAMI row
                        tbl.Cell().ColumnSpan(2).Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(6).AlignCenter().AlignMiddle().Text("JAMI").Bold().FontSize(10.5f);
                        tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(model.TotalWagons > 0 ? model.TotalWagons.ToString() : "—").Bold().FontSize(10.5f);
                        tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).AlignCenter().AlignMiddle().Text(model.TotalTons > 0 ? model.TotalTons.ToString("0.###") : "—").Bold().FontSize(10.5f);
                        tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).Text("");
                        tbl.Cell().Border(0.6f).BorderColor(Colors.Black).PaddingVertical(8f).PaddingHorizontal(4).Text("");
                    });

                    // Bottom Signatures (225x56, QR 44x44)
                    col.Item().PaddingTop(14).AlignCenter().Row(sr =>
                    {
                        // Marketing Card
                        sr.ConstantItem(225).Height(56).Layers(layers =>
                        {
                            layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 225 56' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='224' height='55' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                            layers.PrimaryLayer().PaddingVertical(5).PaddingHorizontal(6).Row(cr1 =>
                            {
                                cr1.RelativeItem().AlignMiddle().Column(sc =>
                                {
                                    sc.Spacing(0.8f);
                                    sc.Item().Row(stRow =>
                                    {
                                        stRow.ConstantItem(10).Height(10).AlignMiddle().Svg(CheckCircleSvg);
                                        stRow.RelativeItem().PaddingLeft(3).AlignMiddle().Text("Yaratildi").FontColor(Colors.Green.Darken2).Bold().FontSize(8.5f);
                                    });
                                    sc.Item().Text(creatorRoleTitle).FontSize(8f).FontColor(Colors.Grey.Darken3);
                                    sc.Item().Text(marketingName).Bold().FontSize(8.5f);
                                    sc.Item().Text(FormatUzt(marketingAt)).FontSize(8f).FontColor(Colors.Grey.Darken1);
                                });
                                if (marketingQrBytes.Length > 0)
                                {
                                    cr1.ConstantItem(44).Height(44).AlignMiddle().Layers(ql =>
                                    {
                                        ql.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='100%' height='100%'><rect x='0' y='0' width='44' height='44' rx='4' ry='4' fill='#f1f5f9'/></svg>");
                                        ql.PrimaryLayer().Padding(1).Image(marketingQrBytes);
                                    });
                                }
                            });
                        });

                        if (!isCondensate)
                        {
                            sr.ConstantItem(20);

                            // Accounting Card
                            sr.ConstantItem(225).Height(56).Layers(layers =>
                            {
                                layers.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 225 56' preserveAspectRatio='none' width='100%' height='100%'><rect x='0.5' y='0.5' width='224' height='55' rx='6' ry='6' fill='#ffffff' stroke='#cbd5e1' stroke-width='1'/></svg>");

                                layers.PrimaryLayer().PaddingVertical(5).PaddingHorizontal(6).Row(cr2 =>
                                {
                                    cr2.RelativeItem().AlignMiddle().Column(sc =>
                                    {
                                        sc.Spacing(0.8f);
                                        sc.Item().Row(stRow =>
                                        {
                                            stRow.ConstantItem(10).Height(10).AlignMiddle().Svg(CheckCircleSvg);
                                            stRow.RelativeItem().PaddingLeft(3).AlignMiddle().Text("Kelishildi").FontColor(Colors.Green.Darken2).Bold().FontSize(8.5f);
                                        });
                                        sc.Item().Text("Buxgalteriya").FontSize(8f).FontColor(Colors.Grey.Darken3);
                                        sc.Item().Text(accountingName).Bold().FontSize(8.5f);
                                        sc.Item().Text(FormatUzt(accountingAt)).FontSize(8f).FontColor(Colors.Grey.Darken1);
                                    });
                                    if (accountingQrBytes.Length > 0)
                                    {
                                        cr2.ConstantItem(44).Height(44).AlignMiddle().Layers(ql =>
                                        {
                                            ql.Layer().Svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='100%' height='100%'><rect x='0' y='0' width='44' height='44' rx='4' ry='4' fill='#f1f5f9'/></svg>");
                                            ql.PrimaryLayer().Padding(1).Image(accountingQrBytes);
                                        });
                                    }
                                });
                            });
                        }
                    });
                });

                page.Footer().Row(r =>
                {
                    r.RelativeItem().Text("E-TRANSPORT Axborot tizimi | Mahsulotlarni yuklash hujjati").FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                    r.RelativeItem().AlignRight().Text(model.OrderNumber).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                });
            });
        });

        return doc.GeneratePdf();
    }
}
