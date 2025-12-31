# Deploying to VPS via Docker

## Prerequisite
- VPS with Docker & Docker Compose installed.
- Git installed.

## 1. Connect to VPS
SSH into your server:
```bash
ssh user@your-vps-ip
```

## 2. Clone Repository
Clone the project from GitHub:
```bash
git clone https://github.com/jokhuzb1/NAMANGAN_TOSHKENT_TAXI.git
cd NAMANGAN_TOSHKENT_TAXI
```

## 3. Configure Environment
Create and edit the `.env` file:
```bash
nano .env
```
Paste your local `.env` content into this file. 
**Important**: Ensure `MONGO_URI` is correct. If using a cloud database (Atlas), it works as is.

Save (Ctrl+O, Enter) and Exit (Ctrl+X).

## 4. Run with Docker
Start the bot in the background:
```bash
docker-compose up -d --build
```

## 5. Management Commands
- **Check Logs**: `docker-compose logs -f`
- **Restart**: `docker-compose restart`
- **Stop**: `docker-compose down`
- **Update Code**:
  ```bash
  git pull
  docker-compose up -d --build
  ```
