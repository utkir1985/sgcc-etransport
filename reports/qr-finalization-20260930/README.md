QR finalizatsiyasi — 2026-09-30

E-Transport va 172.16.90.54:8080 QrLink API tuzatishlari ishga tushirildi.

- 31 ta yakunlangan yuk xati, 22 ta kirish ruxsatnomasi va 1 ta dalolatnoma qayta yuklandi.
- 44 ta vaqt qo‘shimchali dublikat va 2 ta raqami o‘zgargan eski hujjat havolasi tegishli yakuniy PDF bilan yangilandi. Eski havolalar saqlanadi; PDF ichidagi markaziy QR hozirgi asosiy hujjatga olib boradi.
- 6 ta tugallanmagan kirish hujjati QrLink’da xato Approved bo‘lgan; Pending holatiga audit bilan tuzatildi: ENP-0926-004, 005, 006, 007, 009 va PR-08092026-BC4F. Ularga tugallanmagan tasdiqlar qo‘shilmadi. Yakuniy tasdiqdan keyin fon servisi to‘liq faylni yuboradi.
- WB-0926-004 va WB-0926-005 dagi bo‘sh qo‘riqlash nomi foydalanuvchi ko‘rsatmasi bilan Azizov Rustam Hamidovich; WB-0926-005 dagi bo‘sh ruxsatnoma nomi Babayev Shakir Uvaydullayevich bilan to‘ldirildi. Bu tarixiy imzolovchini aniqlash emas, buyurtma asosidagi ma’lumot tuzatishi; QrLegacySignerBackfill audit yozuvlari saqlandi. Tasdiq sanalari o‘zgartirilmadi.

Yangi ishlash tartibi:

1. Xom yuk xati QrLink’ga yuborilmaydi.
2. Qo‘riqlash tasdig‘i bazaga saqlangach fon servisi uyg‘onadi. Kirish ruxsatnomasi ham yakuniy tasdiqdan keyin yuboriladi.
3. Avval faylsiz ro‘yxatdan o‘tkazish bilan haqiqiy GlobalId olinadi; undan markaziy QR va yakuniy PDF yaratiladi.
4. /register 409 qaytarsa, hujjat raqamini o‘zgartirmasdan /update ishlatiladi.
5. Muvaffaqiyatli yuklashdan keyingina bazada model fingerprinti saqlanadi. O‘zgarmagan hujjat takror yuklanmaydi. Xato bo‘lsa, restartdan keyin ham qayta urinish davom etadi; davriy tekshiruv bir daqiqada bir marta.
6. Yetishmayotgan tasdiqlovchi yoki sana bor yakuniy yuk xati xato sifatida logga tushadi. Yuklash va tarozi ismlari uchun TZdagi zaxira nomlar qo‘llanadi.
7. QrLink avvalgi fayl obyektlari va versiyalarini saqlaydi. Approved hujjatni yangilash faqat shu E-Transport manbasi va ushbu uch hujjat turiga ochilgan; bekor qilingan yoki arxivlangan hujjat qayta faollashtirilmaydi.

Tekshiruv:

- Ikkala API Release build’i muvaffaqiyatli.
- QrFinalizationRegression: 409 overwrite, multipart maydonlari, o‘zgarmas sourceDocumentId, Draft/1C istisnolari, fallback nomlar, markaziy QR, xatodan keyingi retry, fingerprint, o‘zgargan hujjatni yangilash, yetishmayotgan imzoni rad etish — o‘tdi.
- QrLink’dan yuklab olingan 54 ta PDF 4x render qilinib ZXing bilan skanerlandi. Barcha markaziy QR’lar mos; barcha 31 yuk xatida 5 imzo QR’i bor; Kutilmoqda yoki [QR] qolmagan.
- Barcha 31 yuk xatining markaziy QR’i yuqori o‘ng burchakda ekanligi koordinatalar bilan tekshirildi.
- Eski havolalardagi fayllar qayta yuklab olinib tegishli tasdiqlangan PDF SHA-256 bilan solishtirildi.
- QrLink rate-limitiga tushgan 4 hujjat keyingi davrda avtomatik yuborildi; yakuniy navbatda xato qolmadi.

Dalillar shu papkadagi JSON fayllarda. QrLink serverining amaldagi manba katalogi `/home/qrlinkadm/qr-link`; server o‘zgarishi `qrlink-server.patch` da. E-Transport manbasi `/var/www/e-transport` (`/home/etransportadm/e-transport` symlink).

Amaldagi API kalitining SourceSystem qiymati `E-TRANPORT`, QrLink’dagi manba nomi `E-transport`. Bu mavjud kalitga bog‘langan qiymatlar; middleware tenglikni qat’iy tekshiradi. `E-TRANSPORT` ga kalitni moslashtirmasdan o‘zgartirish 401 qaytaradi. Parollar va API kalitlari hisobot yoki yangi skriptga yozilmadi.

Qo‘lda takrorlash:

```bash
export ETRANSPORT_URL=http://127.0.0.1:8080
# ETRANSPORT_ADMIN_TOKEN ga amaldagi administrator JWT tokenini muhit orqali bering.
python3 scripts/maintenance/sync-qrlink-final.py
```

Skript faqat o‘zgargan/yuborilmagan yakuniy hujjatlarni qayta ishlaydi. `uploaded`, `unchanged`, `failed` natijalarini qaytaradi; muvaffaqiyatsizlikda exit code 1.

Zaxiralar: E-Transport manba nusxasi `/tmp/qrlink-fix-backup/src`, E-Transport DB `/tmp/etransport-before-qr-final-20260930.sql`; QrLink serverida DB `/tmp/qrlink-before-final-20260930.sql` va handler yonida `.cs.bak-20260930-qr-final`. DB dumplar root uchun 0600. Ularni odatiy zaxira siyosati bo‘yicha uzoq muddatli saqlash joyiga ko‘chirish mumkin.
