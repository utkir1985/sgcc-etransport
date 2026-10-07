# E-Transport — Modulli arxitektura

```
/var/www/e-transport/
├── docker-compose.yml              # 8. Infrastruktura
├── nginx/nginx.conf                # 2. API Gateway
├── backend/
│   ├── ETransport.sln
│   └── src/
│       ├── ETransport.Api/         # Host (ASP.NET Core 9)
│       ├── ETransport.Core/        # Entity, DTO, Constants
│       ├── ETransport.Infrastructure/
│       │   ├── Data/               # PostgreSQL (EF Core)
│       │   ├── Identity/           # JWT, Auth, Menu
│       │   ├── Audit/              # Audit Log
│       │   ├── Notifications/      # Bildirishnomalar
│       │   └── Storage/            # MinIO
│       └── Modules/
│           ├── ETransport.Modules.Marketing/      # 01
│           ├── ETransport.Modules.Dispatching/    # 02
│           ├── ETransport.Modules.Railway/        # 03
│           ├── ETransport.Modules.Warehouse/      # 04
│           ├── ETransport.Modules.GateScales/     # 05
│           ├── ETransport.Modules.Documents/      # 06
│           ├── ETransport.Modules.Accounting/     # 07
│           └── ETransport.Modules.Dashboard/      # 08
└── frontend/
    └── src/
        ├── app/                    # Router, entry
        ├── shared/                 # Layout, contexts, API
        └── modules/
            ├── auth/               # Login
            ├── marketing/          # 01
            ├── dispatching/        # 02
            ├── railway/            # 03
            ├── warehouse/          # 04
            ├── gate-scales/        # 05
            ├── documents/          # 06
            ├── accounting/         # 07
            └── dashboard/          # 08
```

## Qayta build

```bash
cd /var/www/e-transport
docker compose up -d --build
```
