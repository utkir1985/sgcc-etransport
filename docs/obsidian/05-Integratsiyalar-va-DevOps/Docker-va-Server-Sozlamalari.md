# Docker va Server Sozlamalari

E-Transport tizimi to‘liq Docker orqali ishga tushiriladi va boshqariladi.

---

## 🐳 Konteynerlar Ro‘yxati

| Konteyner nomi | Xizmat | Ichki Port | Tashqi Port |
| :--- | :--- | :--- | :--- |
| `etransport-nginx` | Nginx Proxy / Web Server | `80`, `443` | `0.0.0.0:80` |
| `etransport-frontend` | React Vite Web ilovasi | `80` | `127.0.0.1:5173` |
| `etransport-api` | .NET 9 Web API xizmati | `8080` | `127.0.0.1:8080` |
| `etransport-postgres` | PostgreSQL 16 ma’lumotlar bazasi | `5432` | `127.0.0.1:5432` |
| `etransport-redis` | Redis 7 Kesh va Pub/Sub | `6379` | `127.0.0.1:6379` |
| `etransport-minio` | MinIO Object Storage | `9000`, `9001` | `127.0.0.1:9000-9001`|

---

## 🚀 Asosiy Buyruqlar (Cheat Sheet)

### Konteynerlarni ishga tushirish / qayta yuklash
```bash
cd /var/www/e-transport
# Barcha konteynerlarni orqa fonda ko'tarish:
docker compose up -d

# API backend o'zgarganda qayta build qilish:
docker compose build api && docker compose up -d api

# Konteynerlar holatini tekshirish:
docker ps
```

### Frontendni yangilash (Build & Deploy)
```bash
cd /var/www/e-transport/frontend
npm run build
docker cp dist/. etransport-frontend:/usr/share/nginx/html/
docker exec etransport-frontend nginx -s reload
```

### PostgreSQL Bazaga ulanish
```bash
docker exec -it etransport-postgres psql -U etransport -d etransport
```

### Loglarni kuzatish
```bash
# Backend loglari:
docker logs -f --tail 100 etransport-api

# Nginx loglari:
docker logs -f --tail 100 etransport-nginx
```

---

## 🔗 Bog‘liq Hujjatlar
- [[00-Asosiy/Arxitektura|Arxitektura]]
- [[Home|Bosh Sahifa]]
