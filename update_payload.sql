UPDATE "RecycleBinItems"
SET "PayloadJson" = '{
  "Order": {
    "Id": "498b11a3-1a25-4319-bdec-b581bbde5b1a",
    "OrderNumber": "OL-0926-001",
    "Year": 2026,
    "Month": 9,
    "LogisticsType": "Railway",
    "ContractNumber": "142-2026/MS",
    "ProductType": "Barcha turdagi oltingugurt",
    "Deadline": "2026-09-30T18:00:00Z",
    "Status": "SubmittedToDispatch",
    "CreatedById": "7cb06216-73bf-4588-bfa6-df605f613da9",
    "CreatedAt": "2026-09-08T09:00:00Z",
    "SubmittedAt": "2026-09-08T09:10:00Z",
    "ApprovedAt": "2026-09-08T09:25:00Z",
    "AccountingApproverName": "Buxgalteriya (B. Karimov)",
    "MarketingApprovedAt": "2026-09-08T09:10:00Z",
    "MarketingApproverName": "MS va MX boshlig‘i (A. Xoliqov)",
    "SubmittedToDispatchAt": "2026-09-08T09:30:00Z",
    "DispatchApprovedAt": null,
    "DispatchApproverName": null,
    "DeputyApprovedAt": null,
    "DeputyApproverName": null,
    "QrGlobalId": "OL-0926-001-2026",
    "QrVerificationUrl": "https://qrlink.sgcc.uz/verify/OL-0926-001-2026"
  },
  "Lines": [
    {
      "Id": "11111111-1111-1111-1111-111111111111",
      "MonthlyOrderId": "498b11a3-1a25-4319-bdec-b581bbde5b1a",
      "SortOrder": 1,
      "Contractor": "«Maxam-Chirchiq» AJ",
      "WagonCount": 10,
      "TonCount": 600,
      "QuantityUnit": "tn",
      "DestinationStation": "Chirchiq (721200)",
      "AccountingStatus": "Approved"
    },
    {
      "Id": "22222222-2222-2222-2222-222222222222",
      "MonthlyOrderId": "498b11a3-1a25-4319-bdec-b581bbde5b1a",
      "SortOrder": 2,
      "Contractor": "«Navoiyazot» AJ",
      "WagonCount": 5,
      "TonCount": 300,
      "QuantityUnit": "tn",
      "DestinationStation": "Navoiy (730100)",
      "AccountingStatus": "Approved"
    }
  ],
  "Attachments": [
    {
      "Id": "33333333-3333-3333-3333-333333333333",
      "MonthlyOrderId": "498b11a3-1a25-4319-bdec-b581bbde5b1a",
      "FileName": "Ilova_142-2026_shartnoma.pdf",
      "ContentType": "application/pdf",
      "SizeBytes": 245760,
      "ObjectKey": "attachments/orders/498b11a3/Ilova_1.pdf",
      "UploadedAt": "2026-09-08T09:05:00Z"
    }
  ]
}'
WHERE "RelatedNumber" = 'OL-0926-001' OR "Id" = '2ab9313d-ef62-41ac-a9ba-90ba20e935f7';
