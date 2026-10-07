# 🔌 Markaziy QR Link Tizimi bilan Integratsiya Qilish Qo'llanmasi

Ushbu qo'llanma boshqa axborot tizimlaridan (masalan: **KPI**, **HR**, **XARID**, **OMBOR** yoki **HUJJATLAR** tizimlaridan) Markaziy QR Link tizimiga hujjatlarni elektron tarzda yuborish va markaziy reestrda ro'yxatdan o'tkazish tartibini tushuntiradi.

---

## 1. Integratsiyaning Maqsadi

Markaziy tizim har bir qabul qilingan hujjat uchun:
1. **Yagona Global ID** generatsiya qiladi.
2. Hujjatning aslini (PDF) ishonchli **fayl omborida (MinIO)** saqlaydi.
3. Hujjat haqiqiyligini tekshirish uchun ommaviy **Verifikatsiya havolasi (URL)** va uning **QR kodini** shakllantirib beradi.
4. (Ixtiyoriy) Hujjat "Kutilmoqda" (Pending) holatida kiritilsa, uni markaziy tizim administratorlari keyinchalik tasdiqlashi (Approve) mumkin.

---

## 2. API Manzili va Autentifikatsiya

Barcha API so'rovlar markaziy server manziliga qaratilishi kerak:
> **URL:** `POST https://qrlink.sgcc.uz/api/documents/register` *(Domain yoki IP manzil muhitga qarab o'zgarishi mumkin, masalan `http://localhost:5000/api/documents/register`)*

### Xavfsizlik (Headers)
Tizimga faqat ishonchli manbalar ulana olishi uchun so'rov `Header` qismida maxsus API kalit berilishi shart. Ushbu kalit QR Link tizimi administratori tomonidan har bir tizim uchun alohida generatsiya qilib beriladi.

| Header Nomi | Majburiy | Ta'rifi | Misol |
| :--- | :---: | :--- | :--- |
| `X-Source-System` | ✅ Ha | Tizimingizning ruxsat etilgan kodi | `KPI`, `HR`, `HELPDESK`, `OMBOR`, `XARID`, `HUJJATLAR` |
| `X-Api-Key` | ✅ Ha | Tizimingiz uchun berilgan maxfiy API kalit | `KPI-8f92a...` |

---

## 3. Yuboriladigan Ma'lumotlar (Payload)

Hujjat PDF fayli bilan birga yuborilishi kerakligi sababli, API so'rovi oddiy JSON emas, balki **`multipart/form-data`** formatida shakllantirilishi shart.

### Form-Data maydonlari

| Maydon (Field) | Turi | Majburiy | Ta'rifi | Misol |
| :--- | :---: | :---: | :--- | :--- |
| `sourceSystem` | `string` | ✅ Ha | Tizim kodi (Header dagi bilan bir xil bo'lishi shart) | `KPI` |
| `sourceDocumentId` | `string` | ✅ Ha | O'z tizimingizdagi hujjatning noyob (unique) identifikatori. | `DOC-2026-001` |
| `documentType` | `string` | ✅ Ha | Hujjat toifasi (Masalan: Buyruq, Shartnoma, Dalolatnoma) | `Buyruq` |
| `title` | `string` | ✅ Ha | Hujjatning to'liq sarlavhasi (qisqa va aniq) | `Xodimni ishga qabul qilish` |
| `status` | `string` | ❌ Yo'q | Hujjat holati. `Approved` (Tasdiqlangan) yoki `Pending` (Kutilmoqda). Agar berilmasa avtomat `Approved` bo'ladi. | `Pending` |
| `ownerName` | `string` | ❌ Yo'q | Hujjat egasi, ijrochisi yoki uni yuborgan shaxs ismi | `Toshmatov Eshmat` |
| `metadataJson` | `string` | ❌ Yo'q | Ixtiyoriy qo'shimcha ma'lumotlar JSON string formatida | `{"department":"IT"}` |
| `workflow` | `string` | ❌ Yo'q | Hujjatga tegishli workflow jarayoni JSON formatida | `{"step":"final_approval"}` |
| `file` | `File` | ❌ Yo'q | PDF formatidagi hujjatning o'zi (ixtiyoriy) | `buyruq.pdf` (binary) |

> **💡 "Pending" holati haqida:** Agar hujjatni `status=Pending` qilib jo'natsangiz, bu hujjat QR Link tizimida kutilayotganlar qatoriga tushadi va QR Link administratorlari uni "Tasdiqlash" tugmasi orqali `Approved` holatiga o'tkazmaguncha ommaviy verifikatsiyadan o'tmaydi.

---

## 4. Dasturlash Tillarida Bajarish Misollari

### 💻 cURL (Terminal)
```bash
curl -X POST http://localhost:5000/api/documents/register \
  -H "X-Source-System: KPI" \
  -H "X-Api-Key: SIZNING_MAXFIY_KALITINGIZ" \
  -F "sourceSystem=KPI" \
  -F "sourceDocumentId=DOC-2026-001" \
  -F "documentType=Buyruq" \
  -F "title=Xodimni ishga qabul qilish" \
  -F "status=Approved" \
  -F "file=@/mening/kompyuterim/buyruq.pdf"
```

### 💻 JavaScript / Node.js (Fetch)
```javascript
const formData = new FormData();
formData.append("sourceSystem", "KPI");
formData.append("sourceDocumentId", "DOC-2026-001");
formData.append("documentType", "Buyruq");
formData.append("title", "Xodimni ishga qabul qilish");
formData.append("status", "Pending"); // Markazda tasdiqlanishini kutadi
formData.append("file", fileInput.files[0]); // yoki Node.js da fs.createReadStream()

fetch("http://localhost:5000/api/documents/register", {
  method: "POST",
  headers: {
    "X-Source-System": "KPI",
    "X-Api-Key": "SIZNING_MAXFIY_KALITINGIZ"
  },
  body: formData
})
.then(res => res.json())
.then(data => console.log("QR Link Javobi:", data))
.catch(err => console.error("Xatolik:", err));
```

### 💻 C# (.NET HttpClient)
```csharp
using var client = new HttpClient();
client.DefaultRequestHeaders.Add("X-Source-System", "KPI");
client.DefaultRequestHeaders.Add("X-Api-Key", "SIZNING_MAXFIY_KALITINGIZ");

using var content = new MultipartFormDataContent();
content.Add(new StringContent("KPI"), "sourceSystem");
content.Add(new StringContent("DOC-2026-001"), "sourceDocumentId");
content.Add(new StringContent("Buyruq"), "documentType");
content.Add(new StringContent("Xodimni ishga qabul qilish"), "title");

// PDF faylni qo'shish
var fileContent = new ByteArrayContent(File.ReadAllBytes("buyruq.pdf"));
fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
content.Add(fileContent, "file", "buyruq.pdf");

var response = await client.PostAsync("http://localhost:5000/api/documents/register", content);
var result = await response.Content.ReadAsStringAsync();
// result ni JSON dan deserialize qilib olasiz
```

### 💻 PHP (cURL)
```php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "http://localhost:5000/api/documents/register");
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    "X-Source-System: KPI",
    "X-Api-Key: SIZNING_MAXFIY_KALITINGIZ"
));

$data = array(
    'sourceSystem' => 'KPI',
    'sourceDocumentId' => 'DOC-2026-001',
    'documentType' => 'Buyruq',
    'title' => 'Xodimni ishga qabul qilish',
    'status' => 'Approved',
    'file' => new CURLFile('/mening/kompyuterim/buyruq.pdf', 'application/pdf', 'buyruq.pdf')
);

curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
```

---

## 5. Tizimdan Keluvchi Javob (Response)

Agar barcha ma'lumotlar to'g'ri bo'lsa va tizimga hujjat muvaffaqiyatli saqlansa, API quyidagi ko'rinishda **HTTP 200 OK** javob qaytaradi:

```json
{
  "success": true,
  "data": {
    "globalId": "KPI-20260721-A1B2C3D4",
    "verificationUrl": "http://localhost/verify/KPI-20260721-A1B2C3D4",
    "qrCodeBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "registeredAt": "2026-07-21T10:00:00Z"
  }
}
```

### Xatoliklar (Errors)
Agar xatolik yuz bersa, quyidagi HTTP status kodlari va JSON xabar qaytadi:
*   **`400 Bad Request`**: Majburiy maydonlar to'ldirilmagan yoki `sourceSystem` noto'g'ri.
*   **`401 Unauthorized`**: `X-Api-Key` ko'rsatilmagan, noto'g'ri yoki muddati tugagan.
*   **`409 Conflict`**: `sourceDocumentId` bilan hujjat avval ham jo'natilgan (Takroriy jo'natish).

---

## 6. Keyingi Qadamlar (Tavsiyalar)

1. **Global ID ni saqlash:** API dan javob sifatida olingan `globalId` ni o'z tizimingizdagi hujjatlar bazasida (masalan, `qr_global_id` ustuniga) saqlab qo'yishni unutmang. Bu keyinchalik hujjatni qidirish yoki holatini tekshirish uchun kerak bo'ladi.
2. **QR Kodni ishlatish:** O'zingizdagi hujjatlarni chop etish (Print) qismida, API yuborgan **`qrCodeBase64`** ma'lumotini `<img src="data:image/png;base64, {qrCodeBase64}" />` orqali to'g'ridan-to'g'ri ko'rsatishingiz mumkin.
3. **Tasdiqlash kutilishi:** Agar hujjatni `Pending` holatida yuborsangiz, ommaviy verifikatsiya sahifasi uning hozircha yaroqsiz ekanligini ko'rsatadi. QR Link adminlari qachonki hujjatni tasdiqlasa, so'ngra hujjat haqiqiy deb topiladi.
