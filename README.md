# Wedding RSVP

Простой Docker-проект для свадебного приглашения: статический фронтенд, backend API, Postgres, Caddy с HTTPS и автоматический деплой на VPS через GitHub Actions.

## Что получилось

- `frontend/` — обычные `HTML`, `CSS`, `JS`, отдаётся внутренним Nginx.
- `backend/` — Node.js + Express API, валидация формы, запись в Postgres, `/admin` с таблицей заявок.
- `infra/caddy/` — Caddy reverse proxy и автоматический HTTPS.
- `.github/workflows/deploy.yml` — деплой на VPS по SSH при каждом `push`.
- `docker-compose.yml` — запуск Caddy, frontend, backend и Postgres.

## Порты

Для Caddy нужны только:

- `80/tcp` — HTTP, выпуск сертификата и редирект на HTTPS.
- `443/tcp` — HTTPS-сайт.
- `22/tcp` — SSH для деплоя.

`8443` не нужен. `acme.sh` тоже не нужен: Caddy сам выпускает и продлевает сертификаты.

Не открывать наружу:

- `5432/tcp` — Postgres.
- `8080/tcp` — backend.

## Локальный запуск на Windows

```powershell
copy .env.example .env
docker compose up --build
```

Локально:

- сайт: [http://localhost](http://localhost)
- таблица заявок: [http://localhost/admin](http://localhost/admin)
- healthcheck: [http://localhost/health](http://localhost/health)

Остановка:

```powershell
docker compose down
```

Остановка с удалением базы:

```powershell
docker compose down -v
```

## `.env`

В репозиторий настоящий `.env` не коммитится. Для VPS есть два варианта.

Рекомендуемый вариант: положить весь `.env` в GitHub secret `VPS_ENV_FILE`. Тогда GitHub Actions сам создаёт файл `/opt/wedding-rsvp/.env` на сервере при каждом деплое.

Содержимое `VPS_ENV_FILE`:

```env
HTTP_PORT=80
HTTPS_PORT=443

CADDY_SITE_ADDRESS=example.com

POSTGRES_USER=rsvp
POSTGRES_PASSWORD=change-this-database-password
POSTGRES_DB=wedding_rsvp

ADMIN_USER=admin
ADMIN_PASSWORD=change-this-admin-password
```

Замените `example.com` на свой домен. Домен должен иметь `A`-запись на IP сервера.

Второй вариант: создать `/opt/wedding-rsvp/.env` на сервере один раз руками. Workflow не удаляет и не перезаписывает серверный `.env`, если secret `VPS_ENV_FILE` пустой.

## Подготовка VPS один раз

Пример для Ubuntu 22.04/24.04. Эти команды нужны только для первичной подготовки сервера. После этого деплой идёт через GitHub Actions без ручных команд на сервере.

### 1. Подключиться к серверу

```bash
ssh root@SERVER_IP
```

### 2. Установить Docker, UFW и rsync

```bash
apt update
apt install -y ca-certificates curl ufw rsync openssh-server

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Проверка:

```bash
docker --version
docker compose version
```

### 3. Создать пользователя для деплоя

Пользователь: `deploy`.

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

mkdir -p /opt/wedding-rsvp
chown -R deploy:deploy /opt/wedding-rsvp
```

Права:

- SSH-доступ по ключу.
- Группа `docker`.
- Владелец папки `/opt/wedding-rsvp`.
- `sudo` не нужен.

### 4. Создать SSH-ключ для GitHub Actions

На своём компьютере:

```bash
ssh-keygen -t ed25519 -C "github-actions-wedding-rsvp" -f github-actions-wedding-rsvp
```

На сервере добавить публичный ключ:

```bash
mkdir -p /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

В файл `authorized_keys` вставьте содержимое `github-actions-wedding-rsvp.pub`.

Приватный ключ `github-actions-wedding-rsvp` добавьте в GitHub secret `VPS_SSH_KEY`.

### 5. Открыть firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

Если у VPS-провайдера есть отдельный firewall в панели, там тоже открыть:

- `22/tcp`
- `80/tcp`
- `443/tcp`

### 6. Проверить DNS

На домене должна быть `A`-запись:

```text
example.com -> SERVER_IP
```

Без правильной DNS-записи Caddy не сможет выпустить сертификат.

## GitHub Secrets

В GitHub откройте:

```text
Repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Добавьте:

```text
VPS_HOST=SERVER_IP
VPS_USER=deploy
VPS_PORT=22
VPS_PROJECT_DIR=/opt/wedding-rsvp
```

`VPS_SSH_KEY` — приватный ключ целиком, например:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

`VPS_ENV_FILE` — весь production `.env` целиком:

```env
HTTP_PORT=80
HTTPS_PORT=443
CADDY_SITE_ADDRESS=example.com
POSTGRES_USER=rsvp
POSTGRES_PASSWORD=change-this-database-password
POSTGRES_DB=wedding_rsvp
ADMIN_USER=admin
ADMIN_PASSWORD=change-this-admin-password
```

После этого любой `push` в репозиторий запустит `.github/workflows/deploy.yml`: файлы скопируются на VPS, `.env` создастся из `VPS_ENV_FILE`, контейнеры пересоберутся и перезапустятся.

## Проверка после первого деплоя

На сервер можно зайти один раз и проверить:

```bash
cd /opt/wedding-rsvp
docker compose ps
bash infra/scripts/check-vps-ports.sh
```

Сайт:

```text
https://example.com
```

Админка:

```text
https://example.com/admin
```

Логин и пароль для админки берутся из `ADMIN_USER` и `ADMIN_PASSWORD`.

## Если Docker не скачивает образы

Если `docker compose up --build` падает на скачивании образов с ошибкой про `registry-1.docker.io`, проблема обычно в доступе Docker к Docker Hub, VPN или прокси.

Быстрая проверка:

```powershell
docker pull caddy:2-alpine
docker pull postgres:16-alpine
docker pull nginx:1.27-alpine
docker pull node:20-bookworm-slim
```

Если эти команды тоже падают:

- перезапустите Docker Desktop;
- временно выключите VPN/прокси и повторите запуск;
- если используете прокси/VPN с локальным портом, укажите его в Docker Desktop: `Settings` -> `Resources` -> `Proxies`;
- после изменения прокси нажмите `Apply & restart`;
- на VPS это обычно исчезает, если сервер имеет прямой доступ к Docker Hub.

## API

Фронтенд отправляет форму на:

```text
POST /api/rsvp
```

Пример тела запроса:

```json
{
  "fullName": "Иван Иванов",
  "attendance": "yes",
  "allergies": "Нет",
  "drinks": ["champagne", "non_alcoholic"]
}
```

Допустимые значения `attendance`:

- `yes`
- `no`
- `later`

Допустимые значения `drinks`:

- `champagne`
- `red_wine`
- `white_wine`
- `cognac`
- `non_alcoholic`
