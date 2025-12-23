# Redis Setup Guide

Hướng dẫn cài đặt và cấu hình Redis cho TechCare Backend.

## Tại sao dùng Redis?

- ✅ **Performance**: Tốc độ xử lý nhanh hơn in-memory store
- ✅ **Scalability**: Chia sẻ data giữa nhiều server instances
- ✅ **Persistence**: Dữ liệu không mất khi server restart
- ✅ **Distributed**: Hỗ trợ cluster và replication

## Cài đặt Redis

### Windows

1. **Download Redis for Windows:**
   - Tải từ: https://github.com/microsoftarchive/redis/releases
   - Hoặc dùng WSL2 với Redis

2. **Hoặc dùng Docker:**
   ```bash
   docker run -d -p 6379:6379 --name redis redis:latest
   ```

### Linux/macOS

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server

# macOS (với Homebrew)
brew install redis
brew services start redis

# Hoặc dùng Docker
docker run -d -p 6379:6379 --name redis redis:latest
```

## Cấu hình

### 1. Environment Variables

Thêm vào file `.env`:

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Hoặc với password
REDIS_URL=redis://:password@localhost:6379

# Hoặc với Redis Cloud
REDIS_URL=redis://default:password@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
```

### 2. Cài đặt Dependencies

```bash
cd backend
npm install
```

## Kiểm tra Redis

### Test kết nối:

```bash
# Kiểm tra Redis đang chạy
redis-cli ping
# Kết quả: PONG

# Hoặc từ Node.js
node -e "const redis = require('redis'); const client = redis.createClient(); client.connect().then(() => console.log('Connected!')).catch(console.error);"
```

## Fallback Mechanism

Hệ thống tự động fallback về in-memory store nếu:
- Redis không khả dụng
- Kết nối Redis bị lỗi
- Redis chưa được cài đặt

**Lưu ý:** Khi dùng in-memory fallback:
- ❌ Không chia sẻ được giữa nhiều server instances
- ❌ Mất data khi server restart
- ✅ Vẫn hoạt động bình thường cho single server

## Production Setup

### Redis với Password

```env
REDIS_URL=redis://:your-strong-password@localhost:6379
```

### Redis Cluster

```env
REDIS_URL=redis://node1:6379,node2:6379,node3:6379
```

### Redis Cloud (Redis Labs, AWS ElastiCache, etc.)

```env
REDIS_URL=redis://default:password@your-redis-instance.redis.cache.amazonaws.com:6379
```

## Monitoring

### Kiểm tra Redis stats:

```bash
redis-cli INFO stats
```

### Xem keys trong Redis:

```bash
redis-cli KEYS "ratelimit:*"
redis-cli KEYS "apiratelimit:*"
```

## Troubleshooting

### Lỗi: "Redis connection failed"

1. Kiểm tra Redis đang chạy:
   ```bash
   redis-cli ping
   ```

2. Kiểm tra port:
   ```bash
   netstat -an | grep 6379
   ```

3. Kiểm tra firewall:
   - Đảm bảo port 6379 không bị block

### Lỗi: "ECONNREFUSED"

- Redis chưa được start
- Port không đúng
- Redis đang chạy trên host khác

### Performance Issues

- Tăng `maxmemory` trong Redis config
- Dùng Redis persistence (RDB hoặc AOF)
- Monitor memory usage

## Best Practices

1. **Set maxmemory policy:**
   ```bash
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. **Enable persistence:**
   - RDB snapshots cho backup
   - AOF cho durability

3. **Monitor memory:**
   ```bash
   redis-cli INFO memory
   ```

4. **Set TTL cho keys:**
   - Hệ thống tự động set TTL cho rate limit keys
   - Không cần manual cleanup

## Testing

Sau khi setup, khởi động server và kiểm tra logs:

```
✅ Redis: Connected and ready
```

Nếu thấy message này, Redis đã hoạt động!

