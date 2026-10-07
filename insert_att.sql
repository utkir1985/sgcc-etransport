INSERT INTO "OrderAttachments" ("Id", "MonthlyOrderId", "FileName", "ContentType", "SizeBytes", "ObjectKey", "UploadedById", "UploadedAt")
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '498b11a3-1a25-4319-bdec-b581bbde5b1a',
  'Ilova_142-2026_shartnoma.pdf',
  'application/pdf',
  245760,
  'attachments/orders/498b11a3/Ilova_1.pdf',
  '7cb06216-73bf-4588-bfa6-df605f613da9',
  NOW()
)
ON CONFLICT ("Id") DO UPDATE
SET "FileName" = EXCLUDED."FileName", "MonthlyOrderId" = EXCLUDED."MonthlyOrderId";
