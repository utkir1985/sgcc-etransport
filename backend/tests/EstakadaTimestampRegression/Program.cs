using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;

// Estakada oralig'i Sfera Balance sutkalik disbalansining asosi: vagon estakadada
// turgan vaqt ichida mahsulot sferadan chiqadi. Oraliq noto'g'ri yozilsa, netto
// noto'g'ri sutkaga tushadi — shuning uchun chegaraviy holatlar shu yerda qulflanadi.

var fresh = new EmptyWagonUnit();
EmptyWagonUnitSync.MarkEstakadaPlaced(fresh);
if (fresh.EstakadaPlacedAt is null) throw new Exception("Estakadaga qo'yilgan vaqt yozilmadi");
if (fresh.EstakadaRemovedAt is not null) throw new Exception("Yangi qo'yilgan vagon olingan bo'lib qoldi");

// Allaqachon estakadada turgan vagonni qayta belgilash vaqtni surmasin.
var placedAt = fresh.EstakadaPlacedAt;
Thread.Sleep(5);
EmptyWagonUnitSync.MarkEstakadaPlaced(fresh);
if (fresh.EstakadaPlacedAt != placedAt) throw new Exception("Qo'yilgan vaqt qayta yozildi");

// Olish — bir marta.
EmptyWagonUnitSync.MarkEstakadaRemoved(fresh);
var removedAt = fresh.EstakadaRemovedAt ?? throw new Exception("Estakadadan olingan vaqt yozilmadi");
Thread.Sleep(5);
EmptyWagonUnitSync.MarkEstakadaRemoved(fresh);
if (fresh.EstakadaRemovedAt != removedAt) throw new Exception("Olingan vaqt qayta yozildi");
if (fresh.EstakadaRemovedAt < fresh.EstakadaPlacedAt) throw new Exception("Olingan vaqt qo'yilgandan oldin");
Console.WriteLine("PASS: qo'yish bir marta yoziladi, takror belgilash vaqtni surmaydi, olish bir marta yoziladi.");

// Qaytarilgan vagon qayta qo'yilsa — yangi sikl, eski oraliq tashlanadi.
Thread.Sleep(5);
EmptyWagonUnitSync.MarkEstakadaPlaced(fresh);
if (fresh.EstakadaRemovedAt is not null) throw new Exception("Yangi siklda eski olingan vaqt qoldi");
if (fresh.EstakadaPlacedAt == placedAt) throw new Exception("Yangi siklda qo'yilgan vaqt yangilanmadi");
Console.WriteLine("PASS: qayta qo'yilgan vagon yangi oraliq boshlaydi.");

// Estakadaga qo'yilmagan vagon "olingan" bo'lib qolmasin — aks holda Sfera
// tomonida boshi yo'q oraliq paydo bo'lardi.
var never = new EmptyWagonUnit();
EmptyWagonUnitSync.MarkEstakadaRemoved(never);
if (never.EstakadaRemovedAt is not null) throw new Exception("Qo'yilmagan vagonga olingan vaqt yozildi");
Console.WriteLine("PASS: qo'yilmagan vagonga olingan vaqt yozilmaydi.");

// ---------------------------------------------------------------------------
// Har bir holat o'zgarishi estakada vaqtini yozishi shart. 2026-10-15 da
// guruh bilan yuklash boshlash nuqtasi o'tkazib yuborilgan edi: operatorlar
// aynan o'sha tugmani bosgani uchun bir kun davomida birorta vaqt yozilmadi.
// Shuning uchun nuqtalar qo'lda emas, manbadan skanerlab tekshiriladi.
// ---------------------------------------------------------------------------
var root = new DirectoryInfo(Directory.GetCurrentDirectory());
while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "src")))
    root = root.Parent;
if (root is null) throw new Exception("Manba papkasi (src) topilmadi — tekshiruv bajarilmadi");

var watched = new[] { "Estakada", "Loading", "ToRailwayScale", "Returned" };
var gaps = new List<string>();
foreach (var file in Directory.EnumerateFiles(Path.Combine(root.FullName, "src"), "*.cs", SearchOption.AllDirectories))
{
    if (file.Contains("/obj/") || file.Contains("/bin/")) continue;
    var lines = File.ReadAllLines(file);
    for (var i = 0; i < lines.Length; i++)
    {
        var hit = watched.FirstOrDefault(w => lines[i].Contains($"Status = EmptyWagonUnitStatuses.{w};"));
        if (hit is null) continue;
        var from = Math.Max(0, i - 4);
        var to = Math.Min(lines.Length - 1, i + 4);
        var near = string.Join("\n", lines[from..(to + 1)]);
        if (!near.Contains("MarkEstakada"))
            gaps.Add($"{Path.GetFileName(file)}:{i + 1} → {hit}");
    }
}
if (gaps.Count > 0)
    throw new Exception("Estakada vaqti yozilmaydigan holat o'zgarishi:\n  " + string.Join("\n  ", gaps));
Console.WriteLine("PASS: barcha holat o'zgarishlari estakada vaqtini yozadi.");
