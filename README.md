# 🚀 TechCare

> A full-stack healthcare platform for clinical workflows, patient data management, and AI-assisted care support.

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

## 🛠 Features
- **Clinical Workflows**: Role-based frontend flows for patient, doctor, and admin usage.
- **Secure Backend Services**: Node.js/Express API with authentication, authorization, and session handling.
- **AI-Assisted Support**: AI routes and healthcare support features integrated into the app experience.
- **Containerized Operations**: Docker Compose profiles for both development and production deployments.

## 📦 Installation

### 1. **Clone the repo**
```bash
git clone https://github.com/yourusername/project.git
cd TechCare-2
```

### 2. **Install dependencies**
```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 3. **Set up `.env` files**
From the repository root (Windows):
```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
copy .env.prod.example .env.prod
```

If you already have local `.env` files, keep yours and only add missing keys from the `*.env.example` files.

### 4. **Run the app (development)**
```bash
docker compose up --build -d
```

### 5. **Check services**
```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

### 6. **Access app/services**
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:5000/health`
- MySQL: `localhost:3306`
- Redis: `localhost:6379`

### 7. **Run production profile**
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Check production status/logs:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f
```

Stop production stack:
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml down
```

### 8. **Useful Docker commands**
```bash
# Stop dev stack
docker compose down

# Stop + remove volumes
docker compose down -v

# Rebuild backend only
docker compose up --build -d backend

# Open backend shell
docker compose exec backend sh
```

### 9. **PowerShell helper script**
Use `scripts/docker.ps1` for shorthand commands:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docker.ps1 -Profile dev -Action up
```

Parameters:
- `-Profile`: `dev` or `prod`
- `-Action`: `up`, `down`, `logs`, `ps`, `build`, `restart`

Common examples:
```powershell
# Start dev stack
powershell -ExecutionPolicy Bypass -File .\scripts\docker.ps1 -Profile dev -Action up

# View dev status
powershell -ExecutionPolicy Bypass -File .\scripts\docker.ps1 -Profile dev -Action ps

# Stream prod logs
powershell -ExecutionPolicy Bypass -File .\scripts\docker.ps1 -Profile prod -Action logs

# Stop prod stack
powershell -ExecutionPolicy Bypass -File .\scripts\docker.ps1 -Profile prod -Action down
```

Notes:
- `prod` profile expects `.env.prod` to exist.
- Run commands from repo root (`TechCare-2`).

### Troubleshooting
- If frontend cannot reach backend, confirm `VITE_API_BASE_URL` in `frontend/.env` is `http://localhost:5000`.
- If backend cannot connect to DB, confirm `DB_HOST=mysql` and `DB_PORT=3306` in `backend/.env`.
- If ports are occupied on your machine, edit host-side ports in `docker-compose.yml`.
- After dependency changes, rebuild containers with `docker compose up --build -d`.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome.  
Please open an issue or submit a pull request with a clear description of your change.
