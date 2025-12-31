---
description: Deploy the bot using Docker
---

# Deployment Guide

1.  **Transfer Files to VPS**:
    Copy the project folder to your VPS. You can use git or scp.
    Ensure you include: `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`.

2.  **Environment Variables**:
    Create a `.env` file on the server in the project directory. You can copy the content of your local `.env`.
    ```bash
    nano .env
    # Paste your variables
    ```

3.  **Run with Docker Compose**:
    ```bash
    docker-compose up -d --build
    ```

4.  **View Logs**:
    ```bash
    docker-compose logs -f
    ```

5.  **Stop/Restart**:
    ```bash
    docker-compose down # Stop
    docker-compose restart # Restart
    ```
