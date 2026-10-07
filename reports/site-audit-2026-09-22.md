# E-Transport auditi — 22.09.2026

Audit ishlab chiqarish jarayoni nuqtayi nazaridan bajarildi. Ilova kodi va ishchi ma’lumotlar o‘zgartirilmadi. Ushbu hisobot yaratildi; sinovlar /tmp/etransport-site-audit ichida, alohida EF InMemory bazasida bajarildi.

**Qamrov va cheklov.** Marketing buyurtmalari, vagon qabul qilish, dispetcherlik, ombor/yuklash, tarozi/plomba, yuk xati, chiqish, dashboard/tarix, admin/rollar/arxiv va 1C/QR integratsiyalarining marshrutlari hamda asosiy kod yo‘llari ko‘rib chiqildi. Server sog‘ligi va bazadagi bog‘lanishlar faqat o‘qish rejimida tekshirildi. Barcha rollar bilan brauzerda tugmalarni bosib chiqish, mobil ko‘rinishlar, tashqi tizimlarga haqiqiy hujjat yuborish va parallel operatorlarning yuklama testi bajarilmadi. Shuning uchun bu barcha sahifalarning vizual sertifikatsiyasi emas.

**Ishchi muhitdagi holat.** 242 ta vagon tashrifi yozuvi, 20 ta yuk xati, 26 ta faol vagon yozuvi. 38 ta vagon raqami bir necha tashrifda uchraydi; bu normal qaytish jarayoni. 9 ta yuk xati shu takror kelgan vagonlar bilan bog‘liq. Bir tashrifning bir nechta yuk xatiga takror biriktirilishi topilmadi. Chiqib ketgan deb belgilangan partiya ichida chiqish vaqti yo‘q vagon topilmadi. Docker xizmatlari ishlayapti. Hozirgi API konteynerining mavjud loglarida fail/exception va 1C fon sync xatosi topilmadi; 2 ta warning bor. Konteyner yaqinda qayta ishga tushgani sabab bu uzoq muddatli barqarorlik xulosasi emas.

## Tasdiqlangan kamchiliklar

### 1. Yuqori — yuk xatini tahrirlashda buyurtmaning bajarilgan tonnasi noto‘g‘ri kamayadi

**Ishlab chiqarish holati:** bir vagon korxonaga ikkinchi marta keladi. Operator shu vagon yozilgan yuk xatini tuzatadi yoki mazmunini o‘zgartirmay qayta saqlaydi.

Oldingi sarfni qaytarishda kod SourceArrivalId bo‘yicha emas, WagonNumber bo‘yicha barcha tarixiy yozuvlarning nettosini qo‘shadi. Shuning uchun boshqa tashrifning yuki ham joriy buyurtmadan ayiriladi. O‘chirish yo‘lida ham shu hisoblash bor.

**Qayta sinov:** umumiy bajarilgan 150 t, joriy tashrif 50 t, oldingi tashrif 40 t. Aynan o‘sha yuk xatini qayta saqlashda 150 t saqlanishi kerak edi; amaldagi controller 110 t saqladi va muvaffaqiyat javobini berdi. Haqiqiy buyurtmalarning qoldig‘i shu auditda o‘zgartirilmagan; ularda zarar allaqachon yuz bergan degan xulosa chiqarilmaydi.

Dalil: [DocumentsController.cs:1008](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:1008), [o‘chirishdagi hisob:1416](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:1416).

Tuzatish yo‘nalishi: qaytariladigan hisobni aynan hujjatdagi tashrif bilan bog‘lash va hujjat tuzilgandagi miqdor nusxasidan olish.

### 2. Yuqori — 1C bitta tortishni ikki tashrifga yozishi mumkin

Sinxronlash 30.07.2026 dan keyingi barcha tashriflarni oladi, shu jumladan chiqqan partiyalarni. Har biriga bir xil vagon raqami va ±5 kun ichidagi eng yaqin tortishni tanlaydi. Bitta 1C yozuvining faqat bitta tashrifga tegishli bo‘lishi ta’minlanmagan.

**Qayta sinov:** 20-sentabrdagi chiqib ketgan tashrif va 22-sentabrdagi yangi tashrif. Faqat 22-sentabr tortishini yuborganda ikkalasiga NEW-SEAL tushdi; eski tashrifning bruttosi ham 60 dan 70 ga o‘zgardi. Bu tarixiy hujjatlar bilan nomuvofiqlik chiqarishi mumkin.

Dalil: [OneCEmptyWagonSyncService.cs:176](/var/www/e-transport/backend/src/ETransport.Infrastructure/Integrations/OneCEmptyWagonSyncService.cs:176), [moslashtirish:212](/var/www/e-transport/backend/src/ETransport.Infrastructure/Integrations/OneCEmptyWagonSyncService.cs:212).

Tuzatish yo‘nalishi: har bir tortishni bitta aniq tashrifga bog‘lash; chiqqan tashriflarni avtomatik qayta yozish uchun alohida nazoratli tartib.

### 3. Yuqori — yuk xatini o‘chirish ayrim odatiy holatlarda server xatosiga tushadi

O‘chirishda butun EF entity JsonSerializer.Serialize(registry) orqali arxivlanadi. Yuk xati → partiya → vagon → partiya ko‘rinishidagi aylanma bog‘lanish serializatsiyani to‘xtatadi.

**Qayta sinov:** odatiy sog‘lom vagonli yuk xatini amaldagi DeleteLoadingRegistry orqali o‘chirish JsonException: “A possible object cycle was detected” bilan tugadi. Bu “o‘chirish taqiqlangan” biznes qoidasi emas, texnik xato.

Dalil: [DocumentsController.cs:1504](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:1504).

Tuzatish yo‘nalishi: arxiv uchun faqat zarur oddiy maydonlardan iborat nusxa yaratish; tiklashdagi hisob-kitoblarni ham tekshirish.

### 4. Yuqori — diagnostika va ommaviy QR sinxronlash ruxsatsiz ochiq

GET /api/documents/debug-qr-status autentifikatsiyasiz hujjat identifikatorlari va QR manzillarini qaytaradi. Ishchi serverda JWTsiz so‘rov HTTP 200 berdi: 20 reyestr, 25 partiya, 1 dalolatnoma yozuvi. Hisobotga identifikatorlarning o‘zi ko‘chirilmadi.

POST /api/documents/sync-qrlink-files ham [AllowAnonymous] bilan belgilangan. Kod tashqi QR tizimiga hujjatlar yuboradi va bazadagi QR maydonlarini yangilaydi. Ushbu POST ishchi serverda chaqirilmadi.

GET /api/auth/demo-users ham JWTsiz 13 rol bo‘yicha login ma’lumotini qaytardi.

Dalil: [DocumentsController.cs:1752](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:1752), [debug:2004](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:2004), [AuthController.cs:59](/var/www/e-transport/backend/src/ETransport.Infrastructure/Identity/Controllers/AuthController.cs:59).

Ochiq QR tekshirish sahifasi ishlab chiqarish ehtiyoji bo‘lishi mumkin. Biroq barcha hujjatlarni sanab beruvchi diagnostika va qayta yuborish amallari shu ehtiyojdan alohida. Admin yoki xizmat autentifikatsiyasi bilan cheklash kerak.

### 5. O‘rta — 1C ulanish sozlamalarini saqlash so‘rovi backendga mos emas

Frontend saveOneCCredentials POST yuboradi; backend shu manzilda faqat PUT qabul qiladi. Natijada oddiy Admin saqlashi to‘g‘ri endpointga tushmaydi. Koddagi usullar nomuvofiqligi tasdiqlandi; haqiqiy login/parol almashtirib sinov qilinmadi.

Dalil: [api.ts:1484](/var/www/e-transport/frontend/src/shared/services/api.ts:1484), [IntegrationSettingsController.cs:41](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Accounting/Controllers/IntegrationSettingsController.cs:41).

### 6. O‘rta — noto‘g‘ri partiya bilan tahrirlash rad etilmaydi

Yuk xatini tahrirlashda SourceArrivalId bo‘yicha yozuv topilmasa, kod o‘sha vagonning boshqa partiyasini tanlaydi. Bu sahifada eski ma’lumot qolib ketganida ham noto‘g‘ri tashrifga yozishga olib kelishi mumkin.

**Qayta sinov:** mavjud bo‘lmagan SourceArrivalId bilan so‘rov yuborildi. Xato qaytishi o‘rniga OkObjectResult olindi va boshqa tashrif tanlandi.

Dalil: [DocumentsController.cs:1038](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:1038).

Tuzatish yo‘nalishi: aniq partiya berilgan bo‘lsa, topilmaganda boshqa partiyaga avtomatik o‘tmaslik.

### 7. O‘rta — ekrandagi “yuk xatiga tayyor” mezoni backend bilan bir xil emas

Frontend hasMeasuredNet tekshiruviga qo‘shimcha ravishda tara va brutto matni bo‘sh bo‘lmasa ham tayyor deb hisoblaydi.

**Amaldagi frontend funksiyasi bilan sinov:** tara/brutto 70/20, 20/20 va abc/xyz holatlarining barchasida isReadyForWaybill=true chiqdi. Backend esa hujjat yaratishda musbat nettoni talab qiladi. Demak, operator tanlay oladi, ammo saqlashda rad javobi olishi mumkin. Bu noto‘g‘ri og‘irlikli hujjat albatta saqlanadi degani emas.

Dalil: [wagonQueueState.ts:14](/var/www/e-transport/frontend/src/shared/utils/wagonQueueState.ts:14), [DocumentsController.cs:391](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:391).

Tuzatish yo‘nalishi: birliklar va vergulli sonlarni to‘g‘ri qabul qilgan holda frontend/backend mezonlarini tenglashtirish.

### 8. Yuqori — rol yoki parol o‘zgarganda avvalgi token bekor qilinmaydi

Login tokeni 12 soatga beriladi. JWT tekshiruvchisi imzo/muddat/issuer/audience ni tekshiradi, lekin joriy foydalanuvchi roli yoki token bekor qilinganligini qayta tekshirmaydi. Admin foydalanuvchi rolini pasaytirsa yoki parolini almashtirsa, oldingi token muddati tugaguncha eski huquq claimlari bilan qoladi. Bu kod tahliliga asoslangan; ishchi foydalanuvchi huquqlari o‘zgartirilmadi.

Dalil: [AuthServices.cs:40](/var/www/e-transport/backend/src/ETransport.Infrastructure/Identity/AuthServices.cs:40), [DependencyInjection.cs:35](/var/www/e-transport/backend/src/ETransport.Infrastructure/DependencyInjection.cs:35), [AuthController.cs:228](/var/www/e-transport/backend/src/ETransport.Infrastructure/Identity/Controllers/AuthController.cs:228).

Tuzatish yo‘nalishi: token versiyasi yoki sessiyani bekor qilish mexanizmi. Ekrandagi 10 daqiqalik harakatsizlik chiqishi server tokenini bekor qilish bilan teng emas.

### 9. Past/o‘rta — “Tarix” sahifasida ulanish xatosi bo‘sh tarixdek ko‘rinadi

API xatosi catch orqali data: [] ga aylantiriladi. Avval ko‘ringan ma’lumot ham bo‘sh ro‘yxat bilan almashtiriladi. Operator “ma’lumot yo‘q” bilan “serverdan olinmadi”ni ajrata olmaydi.

Dalil: [HistoryPage.tsx:163](/var/www/e-transport/frontend/src/modules/dashboard/pages/HistoryPage.tsx:163).

Tuzatish yo‘nalishi: oxirgi muvaffaqiyatli ma’lumotni saqlash va yangilanish xatosini ko‘rsatish.

## Jarayon egasi bilan aniqlashtiriladigan holatlar

Bularni avtomatik ravishda xato deb hisoblamadim:

- **PLOMBASIZ, BEZ PLOMBA, dalolatnoma matni rasmiy plomba o‘rnida qabul qilinishi.** Siz tasdiqlagan ishlab chiqarish istisnosi. Bir xil bunday matn turli vagonlarda bo‘lishi normal. Oldindan plombali vagonni qo‘lda tahrirlash esa oxirgi talabingiz bo‘yicha yopiq.
- **Nomuvofiq/Returned vagonni dalolatnoma bilan sog‘lom vagonlarga qo‘shib chiqarish.** Mahsulot hisobiga qo‘shmasdan qaytarish jarayoni normal.
- **Buyurtmani vagon soni yoki tonna bilan cheklash.** Vagon limiti bor bo‘lsa tonna faqat ma’lumot sifatida turishi mumkin. Ikkalasini bir paytda qat’iy limit deb talqin qilmadim.
- **Kirish xizmat xatini qo‘riqlashning oxirgi imzosidan oldin chop etish.** Smena boshlig‘i va ruxsatnoma byurosi tasdiqlagach qog‘ozni darvozaga olib borish ehtiyoji hujjatlarda ko‘rsatilgan; bu bypass deb belgilanmadi.
- **Avval Kengsoyga chiqarish, keyin 1C/e-nakl qaydini belgilash.** Kodda yangi tartib deb aniq yozilgan. Umumiy “hamma integratsiya chiqishdan oldin bo‘lishi shart” qoidasi bilan baholamadim.
- **“1C/e-naklga yuborish” amali.** Hozir bu kod tashqi APIga hujjat yubormaydi, faqat qayd belgilarini o‘rnatadi. Agar operator boshqa dasturda yuborib bo‘lganini qayd etayotgan bo‘lsa — to‘g‘ri jarayon. Agar avtomatik yuborish kutilayotgan bo‘lsa — tugallanmagan imkoniyat. [DocumentsController.cs:1530](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Documents/Controllers/DocumentsController.cs:1530).
- **Hujjatdagi oldindan belgilangan imzolovchi ismlar.** Eski ma’lumotni to‘ldirish uchun fallbacklar bor. Bu tasdiqlangan korxona shablonimi yoki haqiqiy smena xodimi bo‘lishi kerakmi — aniqlashtirish kerak.
- **Yangi qo‘lda plomba qo‘shish tekshiruvi.** Men kiritgan ushbu qism ham ±5 kun ichidagi shu raqamli har qanday plombali 1C yozuvini ko‘rib rad etadi. Shu oraliqda ikkita tashrif bo‘lsa, eski tashrif plombasi yangi plombasiz vagonga qo‘shishni to‘sishi mumkin. 1C tashrif moslashtirishi tuzatilganda bu joy ham bir xil qoida bilan ishlashi kerak. [OneCIntegrationsController.cs:192](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Accounting/Controllers/OneCIntegrationsController.cs:192).

## Tekshirish dalillari

- Amaldagi controller bilan EF InMemory sinovlari: qayta saqlashda 150 → 110 t; o‘chirishda JSON cycle; noto‘g‘ri partiyaga fallback; 1C bitta yozuvi ikki tashrifga tushishi qayta hosil qilindi.
- PDF va tashqi xizmatlar bu sinovlarda chaqirilmasligi uchun almashtirilgan. Logdagi test PDF warninglari ishlab chiqarishdagi PDF buzilishi dalili emas.
- InMemory testlari PostgreSQL cheklovlari yoki parallel tranzaksiyalarni to‘liq tekshirmaydi; hisoblash, tanlash va serializatsiya yo‘llarini tekshiradi.
- Amaldagi frontend funksiyasi ajratib ishga tushirildi: noto‘g‘ri og‘irliklar tayyor deb hisoblanishi qayta hosil qilindi.
- EntryFlowRegression va ManualSealRegression mavjud testlari o‘tdi.
- So‘nggi frontend build xatosiz; audit davomida ilova kodi/build/deploy o‘zgartirilmadi.
- Ishchi bazaga faqat BEGIN READ ONLY so‘rovlari bajarildi. Hech qanday yuk xati/plomba/og‘irlik/rol o‘zgartirilmadi.
- Autentifikatsiyasiz faqat o‘qish endpointlari tekshirildi. Ommaviy QR sinxronlash chaqirilmadi.

**Tuzatish tartibi:** avval ruxsatsiz texnik endpointlar va eskirgan sessiya huquqlari; keyin tashrifni aniq bog‘lash va buyurtma hisobini saqlash; so‘ng o‘chirish/arxiv, 1C sozlamalari, frontend mezonlari va tarixdagi xato xabarlari. O‘zgarishdan oldin takror kelgan vagonli ssenariylarni regressiya testiga aylantirish kerak.

---

# Tuzatish va deploy — 22.09.2026, 18:15

Yuqoridagi 9 ta tasdiqlangan kamchilik tuzatildi, sinovdan o‘tkazildi va ishlab chiqarishga chiqarildi. O‘zgarishdan oldin kod arxivi va PostgreSQL dumpi olindi.

## Nima qilindi

| № | Kamchilik | Tuzatish |
|---|---|---|
| 1 | Qayta saqlashda buyurtma tonnasi kamayardi | Yo‘nalish yozuviga netto nusxasi (`NetWeight`) qo‘shildi; qaytarish vagon raqami bo‘yicha emas, (tashrif + vagon) juftligi bo‘yicha hisoblanadi. Eski hujjatlar uchun aynan o‘sha tashrifdagi o‘lchov olinadi |
| 2 | 1C bitta tortishni ikki tashrifga yozardi | Moslashtirish oldindan, global taqsimlash bilan bajariladi: har bir tortish faqat bitta tashrifga biriktiriladi. Zavoddan chiqib ketgan tashrif avtomatik qayta yozilmaydi (1C ning o‘z partiyalari bundan mustasno) |
| 3 | O‘chirishda arxivlash server xatosiga tushardi | Korzinaga bog‘lanmagan (`AsNoTracking`) nusxa yoziladi — aylanma bog‘lanish yo‘q. Bu tiklashda partiya nusxasi ikkilanishining ham oldini oladi |
| 4 | Diagnostika va QR sinxronlash loginsiz ochiq edi | `debug-qr-status`, `sync-qrlink-files` va `demo-users` endi `Admin` roli talab qiladi |
| 5 | 1C sozlamalarini saqlash so‘rovi mos emas edi | Frontend `PUT` yuboradi (backend shuni kutadi) |
| 6 | Noto‘g‘ri partiya bilan tahrirlash qabul qilinardi | Ko‘rsatilgan partiyada vagon topilmasa, boshqa tashrifga o‘tilmaydi — xato qaytariladi |
| 7 | Ekrandagi tayyorlik mezoni backenddan farq qilardi | `isReadyForWaybill` faqat o‘lchangan nettoga tayanadi; og‘irlik o‘qish backenddagi qoida bilan tenglashtirildi (`70 tn`, `70,5` kabi yozuvlar) |
| 8 | Rol/parol o‘zgarganda eski token kuchda qolardi | Foydalanuvchiga `TokenVersion` qo‘shildi; har so‘rovda faollik, rol va sessiya versiyasi tekshiriladi. Admin rol/parolni o‘zgartirsa eski tokenlar darhol bekor bo‘ladi. Foydalanuvchi o‘z parolini almashtirsa, joriy sessiya uzilmasligi uchun yangi token beriladi |
| 9 | «Tarix» sahifasi ulanish xatosini bo‘sh ro‘yxatga aylantirardi | Xato alohida ko‘rsatiladi, «qayta urinish» tugmasi qo‘shildi, mavjud ma’lumot o‘chirilmaydi |

Qo‘shimcha: qo‘lda plomba qo‘shishdagi ±5 kunlik tekshiruv ham shu qoidaga keltirildi — endi faqat aynan shu tashrifga tegishli 1C tortishi ko‘riladi. Oldin qayta kelgan vagonda eski tashrif plombasi yangi, plombasiz vagonga yozuv qo‘shishni to‘sib qo‘yardi.

## Sinov natijalari

Yangi `tests/WaybillAccountingRegression` loyihasi yozildi. Sinovlar avval **tuzatishdan oldingi kod** ustida ishga tushirildi va har bir kamchilik qayta hosil bo‘lgani tasdiqlandi:

- qayta saqlash: 150 t kutilgan, **110 t** chiqdi
- mavjud bo‘lmagan partiya: xato o‘rniga **qabul qilindi**
- o‘chirish: **`JsonException: A possible object cycle was detected`**
- o‘chirishda tonna: 100 kutilgan, **60 t** chiqdi
- 1C: chiqib ketgan tashrifning plombasi va bruttosi **o‘zgarib ketdi**

Tuzatilgan kodda bularning barchasi o‘tdi. Mavjud `EntryFlowRegression` va `ManualSealRegression` testlari ham o‘tdi; `ManualSealRegression` ga qayta kelgan vagon ssenariysi qo‘shildi. Frontend `tsc -b` xatosiz.

Autentifikatsiya zanjiri ishchi bazaga tegmasdan, alohida vaqtinchalik konteynerlarda tekshirildi: haqiqiy token bilan HTTP 200; sessiya versiyasi oshirilgach HTTP 401; rol o‘zgargach HTTP 401; o‘z parolini almashtirgach eski token 401, yangi token 200. Tekshiruv muhiti o‘chirildi.

## Deploydan keyingi holat

Barcha konteynerlar sog‘lom. `Users.TokenVersion` ustuni bazada mavjud. Loginsiz so‘rovlar: `debug-qr-status` 401, `demo-users` 401, `sync-qrlink-files` 401. Sayt HTTP 200. API loglarida xato yo‘q.

## Qamrov chegarasi

Barcha rollar bilan brauzerda tugmalarni bosib chiqish, mobil ko‘rinishlar va parallel operatorlar yuklamasi bu bosqichda ham tekshirilmadi. Ishchi ma’lumotlar o‘zgartirilmadi — mavjud buyurtmalardagi eski noto‘g‘ri qoldiqlar avtomatik to‘g‘rilanmaydi, ularni alohida ko‘rib chiqish kerak.

## Ochiq qolgan joylar

- `GET /api/trash/{id}/download` hamon autentifikatsiyasiz ishlaydi. Bu audit ro‘yxatida yo‘q edi va QR/yuklab olish jarayoniga bog‘liq bo‘lishi mumkin — jarayon egasi bilan aniqlashtirish kerak.
- Yuk xati, xizmat xati va dalolatnoma PDF endpointlari ataylab ochiq qoldirildi (QR tekshirish jarayoni).
- «1C/e-naklga yuborish» hamon tashqi tizimga hujjat yubormaydi, faqat belgini qo‘yadi — bu jarayon qarori.

---

# Qo'shimcha to'liq tekshiruv va dizayn tahlili — 22.09.2026, kechqurun

Sizning so'rovingiz bo'yicha butun sayt qayta tekshirildi: barcha 22 ta controller'ning avtorizatsiya qamrovi, fayl bilan ishlash yo'llari va frontenddagi dizayn izchilligi. Bitta **jiddiy** xavfsizlik kamchiligi topildi va tuzatildi; ikkita dizayn nomuvofiqligi aniqlandi.

## KRITIK — Korzinadan fayl yuklab olish orqali serverning istalgan faylini o'qish mumkin edi

**Nima edi:** `GET /api/admin/trash/{id}/download` endpointi `[AllowAnonymous]` bilan belgilangan edi — frontend har doim token yuborsa ham, backend buni talab qilmasdi. Ustiga, `?key=` parametri orqali chaqiruvchi o'chirilgan elementning o'z fayliga emas, **istalgan yo'lga** murojaat qila olardi, chunki `LocalFileStorageService.DownloadAsync` absolyut yo'llarni (`/etc/passwd`, `/app/appsettings.json` va h.k.) to'sqinliqsiz ochib berardi.

**Amaliy oqibat:** loginsiz foydalanuvchi, agar bitta korzina elementining GUID'ini bilsa (masalan admin ekranini ulashganda, brauzer tarixida), serverdagi API konteyneri o'qiy oladigan **istalgan faylni** yuklab olishi mumkin edi — jumladan `appsettings.json` (standart parol/kalitlar), tizim fayllari va boshqa foydalanuvchilarning yuklangan hujjatlari.

**Qayta sinov:** alohida vaqtinchalik konteynerda `key=/etc/hostname` bilan tokensiz so'rov yubordim — server konteyner nomini to'liq qaytardi (HTTP 200). Xuddi shu so'rovni **ishchi serverdagi haqiqiy korzina elementi** bilan sinadim (o'qish rejimida, hech narsa o'zgartirilmadi) — natija bir xil edi.

**Tuzatish:**
- `[AllowAnonymous]` olib tashlandi — endi klass darajasidagi `[Authorize(Roles = Admin)]` kuchda.
- `?key=` faqat o'sha elementning o'z arxiv nusxasi (`PayloadJson`) ichida haqiqatan mavjud bo'lgan qiymatni qabul qiladi — boshqa hech narsani emas.
- `LocalFileStorageService.DownloadAsync` dagi absolyut yo'lni to'g'ridan-to'g'ri ochish imkoniyati butunlay olib tashlandi.
- Topilmagan holatda diskdagi ixtiyoriy PDF faylni "fallback" sifatida qaytarish ham olib tashlandi — bu boshqa foydalanuvchining hujjatini xato so'rovga bog‘lab yuborishi mumkin edi.

**Qayta tekshiruv:** tuzatilgan koddan keyin xuddi shu so'rov — tokensiz 401, admin tokeni bilan begona `key` rad etilib elementning o'z ObjectKey'iga qaytadi, elementning haqiqiy ilova fayli esa avvalgidek ishlaydi. Uchala regressiya testi (`WaybillAccountingRegression`, `ManualSealRegression`, `EntryFlowRegression`) o'tdi. Deploy qilindi, ishchi serverda haqiqiy korzina ID'i bilan qayta tasdiqlandi: 401.

Dalil: [MinioStorageService.cs:34](/var/www/e-transport/backend/src/ETransport.Infrastructure/Storage/MinioStorageService.cs:34), [TrashController.cs:158](/var/www/e-transport/backend/src/Modules/ETransport.Modules.Dashboard/Controllers/TrashController.cs:158).

Boshqa barcha `[AllowAnonymous]` endpointlar (yuk xati/xizmat xati/dalolatnoma/buyurtma PDF'lari) tekshirildi — ularning barchasi faqat hujjatning **o'z** ID'si bo'yicha, tashqi parametrsiz PDF yaratadi. Bu yerda shunga o'xshash muammo yo'q.

## Dizayn nomuvofiqliklari

Kod bazasi 100+ sahifa/komponentdan iborat va ular vaqt davomida turli qo'llardan chiqqan. Ikkita o'lchanadigan nomuvofiqlik topildi:

**1. Sarlavha uslubi yagona emas.** Turli sahifalarda sarlavha uchun kamida 9 ta turli nom bilan sinf ishlatilgan (`thub__title`, `page-title`, `marketing-orders-home__title`, `marketing-product-hub-header__title`, `insight__title`, `login-hero-title`, `yx-annex__title`) va ba'zi joylarda esa to'g'ridan-to'g'ri Tailwind sinflari (`text-2xl font-bold text-gray-900...`, `text-xl font-bold text-slate-900...`). Bitta umumiy "sahifa sarlavhasi" toifasi yo'q.

**2. "Gray" va "slate" ranglari aralashtirib ishlatilgan.** Sayt asosan `slate` rang oilasidan foydalanadi (25 fayl), lekin 9 ta fayl `gray` dan foydalanadi — shu jumladan **umumiy Header** (`shared/components/layout/Header.tsx:295`), ya'ni har bir sahifada ko'rinadigan yuqori panel sarlavhasi. `slate` sovuqroq (ko'kimtir) tusga ega, `gray` esa neytral — yonma-yon qo'yilganda farq sezilarli, ayniqsa qorong'i rejimda. Boshqa fayllar: `RolesPanels.tsx`, `ServerStatusPage.tsx`, `PlansPage.tsx`, `TransportVehiclesPage.tsx`, `DocumentNumberingReferencePanel.tsx`, `WagonTypeSelect.tsx`, `WagonUnitCard.tsx`, `GenericPage.tsx`.

Ikkalasi ham funksional xato emas — sayt ishlaydi, matn o'qiladi, qorong'i rejim buzilmagan. Bu faqat vizual bir xillik masalasi.

**O'zim yozgan qismda ham xuddi shu turdagi kamchilikni topdim va tuzatdim:** yangi qo'shilgan "Sahifa ko'rinishi" panelidagi (`PageAccessPanel.tsx`) Saqlash tugmasi saytning umumiy `.btn-primary` sinfi o'rniga o'zining ad-hoc uslubidan foydalangan edi. Rangi bir xil chiqqan bo'lsa-da (ikkalasi ham amalda bir xil ko'k), markaziy sinfga bog'lanmagani uchun kelajakda dizayn yangilansa bu tugma orqada qolib ketardi. Endi `.btn-primary` ga o'tkazildi.

## Qamrov

Barcha 22 ta backend controller avtorizatsiya jihatidan qayta ko'rib chiqildi (jadval quyida). Frontendda tugma, sarlavha va rang ishlatilishi statistik tarzda tekshirildi — bu qatordan-qatorga vizual tekshiruv emas, chunki brauzerda haqiqiy renderni ko'ra olmayman.

| Controller | Holat |
|---|---|
| Auth, Rbac, Documents, Marketing (5 ta), Warehouse, GateScales, Dashboard, Trash, Dispatching (3 ta), Accounting (3 ta), Railway, Audit | Barchasi tekshirildi — faqat Trash'da jiddiy kamchilik topildi |
