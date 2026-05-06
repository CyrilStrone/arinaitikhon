import crypto from "node:crypto";
import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 8080);

const attendanceValues = new Set(["yes", "no", "later"]);
const drinkValues = new Set(["champagne", "red_wine", "white_wine", "cognac", "non_alcoholic"]);

const attendanceLabels = {
  yes: "Смогу прийти",
  no: "Не смогу прийти",
  later: "Сообщу позже",
};

const drinkLabels = {
  champagne: "Шампанское",
  red_wine: "Красное вино",
  white_wine: "Белое вино",
  cognac: "Коньяк",
  non_alcoholic: "Безалкогольные напитки",
};

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "rsvp",
  password: process.env.PGPASSWORD || "rsvp_password",
  database: process.env.PGDATABASE || "wedding_rsvp",
});

app.use(express.json({ limit: "20kb" }));

const asyncHandler = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAdmin = (request, response, next) => {
  const header = request.headers.authorization || "";
  const [scheme, credentials] = header.split(" ");

  if (scheme !== "Basic" || !credentials) {
    response.set("WWW-Authenticate", 'Basic realm="RSVP Admin"');
    response.status(401).send("Authentication required");
    return;
  }

  const decoded = Buffer.from(credentials, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const username = separator >= 0 ? decoded.slice(0, separator) : "";
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";

  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "change-me";

  if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPassword)) {
    response.set("WWW-Authenticate", 'Basic realm="RSVP Admin"');
    response.status(401).send("Authentication required");
    return;
  }

  next();
};

const validateRsvp = (body) => {
  const errors = [];
  const fullName = String(body.fullName || "").trim();
  const attendance = String(body.attendance || "").trim();
  const allergies = String(body.allergies || "").trim();
  const drinks = Array.isArray(body.drinks) ? body.drinks.map((item) => String(item).trim()) : [];

  if (fullName.length < 2 || fullName.length > 120) {
    errors.push("Укажите имя и фамилию.");
  }

  if (!attendanceValues.has(attendance)) {
    errors.push("Выберите вариант присутствия.");
  }

  if (allergies.length > 1000) {
    errors.push("Поле с ограничениями по питанию слишком длинное.");
  }

  const invalidDrinks = drinks.filter((drink) => !drinkValues.has(drink));

  if (invalidDrinks.length > 0) {
    errors.push("Выбран неизвестный напиток.");
  }

  return {
    errors,
    value: {
      fullName,
      attendance,
      allergies,
      drinks: [...new Set(drinks)],
    },
  };
};

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rsvp_submissions (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      attendance TEXT NOT NULL,
      allergies TEXT NOT NULL DEFAULT '',
      drinks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const renderAdminPage = (rows) => {
  const body = rows
    .map((row) => {
      const drinks = row.drinks?.length
        ? row.drinks.map((drink) => drinkLabels[drink] || drink).join(", ")
        : "—";

      return `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(new Date(row.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Krasnoyarsk" }))}</td>
          <td>${escapeHtml(row.full_name)}</td>
          <td>${escapeHtml(attendanceLabels[row.attendance] || row.attendance)}</td>
          <td>${escapeHtml(row.allergies || "—")}</td>
          <td>${escapeHtml(drinks)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Заявки гостей</title>
    <style>
      :root {
        --bg: #f6f1e9;
        --panel: #fffdf8;
        --ink: #2b2724;
        --muted: #756b63;
        --border: #e7dccc;
        --green: #367c55;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 320px;
        background: var(--bg);
        color: var(--ink);
        font-family: Arial, sans-serif;
      }

      main {
        width: min(1180px, calc(100% - 32px));
        margin: 32px auto;
      }

      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      h1 {
        margin: 0;
        font-size: 32px;
      }

      .count {
        color: var(--muted);
      }

      .table-wrap {
        overflow-x: auto;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: 0 18px 60px rgba(88, 58, 42, 0.08);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 860px;
      }

      th,
      td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #faf5ec;
        font-size: 13px;
        text-transform: uppercase;
        color: var(--muted);
      }

      td {
        white-space: pre-wrap;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      .empty {
        padding: 42px 18px;
        color: var(--muted);
        text-align: center;
      }

      a {
        color: var(--green);
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Заявки гостей</h1>
          <div class="count">Всего записей: ${rows.length}</div>
        </div>
        <a href="/admin">Обновить</a>
      </header>
      <div class="table-wrap">
        ${
          rows.length
            ? `<table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Дата</th>
                    <th>Имя и фамилия</th>
                    <th>Присутствие</th>
                    <th>Питание</th>
                    <th>Напитки</th>
                  </tr>
                </thead>
                <tbody>${body}</tbody>
              </table>`
            : '<div class="empty">Пока нет отправленных анкет.</div>'
        }
      </div>
    </main>
  </body>
</html>`;
};

app.get("/health", asyncHandler(async (request, response) => {
  await pool.query("SELECT 1");
  response.json({ status: "ok" });
}));

app.post("/api/rsvp", asyncHandler(async (request, response) => {
  const { errors, value } = validateRsvp(request.body || {});

  if (errors.length > 0) {
    response.status(400).json({ message: errors[0], errors });
    return;
  }

  const result = await pool.query(
    `
      INSERT INTO rsvp_submissions (full_name, attendance, allergies, drinks)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [value.fullName, value.attendance, value.allergies, value.drinks],
  );

  response.status(201).json({ id: result.rows[0].id });
}));

app.get("/admin", requireAdmin, asyncHandler(async (request, response) => {
  const result = await pool.query(`
    SELECT id, full_name, attendance, allergies, drinks, created_at
    FROM rsvp_submissions
    ORDER BY created_at DESC, id DESC
  `);

  response.type("html").send(renderAdminPage(result.rows));
}));

app.use((error, request, response, next) => {
  console.error(error);

  if (response.headersSent) {
    next(error);
    return;
  }

  response.status(500).json({ message: "Внутренняя ошибка сервера." });
});

const start = async () => {
  await initDb();
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
