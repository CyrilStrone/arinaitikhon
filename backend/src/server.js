import crypto from "node:crypto";
import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 8080);

const attendanceValues = new Set(["yes", "no"]);
const drinkValues = new Set([
  "white_dry_wine",
  "white_semi_dry_wine",
  "white_semi_sweet_wine",
  "red_dry_wine",
  "red_semi_sweet_wine",
  "champagne",
  "prosecco_dry",
  "strong_alcohol",
  "no_alcohol",
  "other",
]);

const attendanceLabels = {
  yes: "Да, с радостью приду",
  no: "К сожалению, не смогу прийти",
};

const drinkLabels = {
  white_dry_wine: "Белое сухое вино",
  white_semi_dry_wine: "Белое полусухое вино",
  white_semi_sweet_wine: "Белое полусладкое вино",
  red_dry_wine: "Красное сухое вино",
  red_semi_sweet_wine: "Красное полусладкое вино",
  champagne: "Шампанское",
  prosecco_dry: "Игристое сухое (просекко)",
  strong_alcohol: "Крепкий алкоголь",
  no_alcohol: "Не буду пить алкоголь",
  other: "Другое",
};

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "rsvp",
  password: process.env.PGPASSWORD || "rsvp_password",
  database: process.env.PGDATABASE || "wedding_rsvp",
});

app.use(express.json({ limit: "100kb" }));

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

const normalizeGuests = (guests) => {
  if (!Array.isArray(guests)) {
    return [];
  }

  return guests
    .map((guest) => {
      if (typeof guest === "string") {
        return guest.trim();
      }

      return String(guest?.fullName || "").trim();
    })
    .filter(Boolean)
    .map((fullName) => ({ fullName }));
};

const validateRsvp = (body) => {
  const errors = [];
  const fullName = String(body.fullName || "").trim();
  const phone = String(body.phone || "").trim();
  const attendance = String(body.attendance || "").trim();
  const allergies = String(body.allergies || "").trim();
  const hasAllergies = body.hasAllergies === true || body.hasAllergies === "yes";
  const guests = normalizeGuests(body.guests);
  const drinks = Array.isArray(body.drinks) ? body.drinks.map((item) => String(item).trim()) : [];
  const drinkOther = String(body.drinkOther || "").trim();
  const playlistSong = String(body.playlistSong || "").trim();

  if (fullName.length < 2 || fullName.length > 120) {
    errors.push("Укажите имя и фамилию.");
  }

  if (phone.length < 2 || phone.length > 120) {
    errors.push("Укажите номер телефона.");
  }

  if (!attendanceValues.has(attendance)) {
    errors.push("Выберите вариант присутствия.");
  }

  if (guests.length > 50) {
    errors.push("Слишком много гостей в одной анкете.");
  }

  if (guests.some((guest) => guest.fullName.length < 2 || guest.fullName.length > 120)) {
    errors.push("Укажите имя и фамилию каждого гостя.");
  }

  const invalidDrinks = drinks.filter((drink) => !drinkValues.has(drink));

  if (invalidDrinks.length > 0) {
    errors.push("Выбран неизвестный напиток.");
  }

  if (drinks.includes("other") && (drinkOther.length < 1 || drinkOther.length > 120)) {
    errors.push("Укажите другой напиток.");
  }

  if (allergies.length > 500) {
    errors.push("Поле с аллергиями слишком длинное.");
  }

  if (hasAllergies && allergies.length < 1) {
    errors.push("Укажите продукты, на которые есть аллергия.");
  }

  if (hasAllergies && /[.,]/.test(allergies)) {
    errors.push("Укажите аллергии без точек и запятых.");
  }

  if (playlistSong.length > 1000) {
    errors.push("Поле с песней слишком длинное.");
  }

  return {
    errors,
    value: {
      fullName,
      phone,
      attendance,
      guests,
      drinks: [...new Set(drinks)],
      drinkOther: drinks.includes("other") ? drinkOther : "",
      hasAllergies,
      allergies: hasAllergies ? allergies : "",
      playlistSong,
    },
  };
};

const createRsvpTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rsvp_submissions (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      attendance TEXT NOT NULL,
      guests JSONB NOT NULL DEFAULT '[]'::JSONB,
      drinks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      drink_other TEXT NOT NULL DEFAULT '',
      has_allergies BOOLEAN NOT NULL DEFAULT false,
      allergies TEXT NOT NULL DEFAULT '',
      playlist_song TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const initDb = async () => {
  await createRsvpTable();

  const requiredColumns = new Set([
    "id",
    "full_name",
    "phone",
    "attendance",
    "guests",
    "drinks",
    "drink_other",
    "has_allergies",
    "allergies",
    "playlist_song",
    "created_at",
  ]);

  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvp_submissions'
  `);

  const existingColumns = new Set(result.rows.map((row) => row.column_name));
  const hasCurrentSchema = [...requiredColumns].every((column) => existingColumns.has(column));

  if (!hasCurrentSchema) {
    await pool.query("DROP TABLE IF EXISTS rsvp_submissions");
    await createRsvpTable();
  }
};

const formatDrinks = (drinks, drinkOther) => {
  if (!Array.isArray(drinks) || drinks.length === 0) {
    return "—";
  }

  return drinks
    .map((drink) => (drink === "other" && drinkOther ? `Другое: ${drinkOther}` : drinkLabels[drink] || drink))
    .join("\n");
};

const formatGuests = (guests) => {
  if (!Array.isArray(guests) || guests.length === 0) {
    return "—";
  }

  return guests
    .map((guest, index) => {
      const fullName = typeof guest === "string" ? guest : guest?.fullName;
      return `${index + 1}. ${fullName || "Без имени"}`;
    })
    .join("\n");
};

const renderAdminPage = (rows) => {
  const body = rows
    .map((row) => {
      const drinks = formatDrinks(row.drinks, row.drink_other);
      const guests = formatGuests(row.guests);
      const allergies = row.has_allergies ? row.allergies || "Да, детали не указаны" : "Нет";

      return `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(new Date(row.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Krasnoyarsk" }))}</td>
          <td>${escapeHtml(row.full_name)}</td>
          <td class="nowrap">${escapeHtml(row.phone)}</td>
          <td>${escapeHtml(attendanceLabels[row.attendance] || row.attendance)}</td>
          <td>${escapeHtml(guests)}</td>
          <td>${escapeHtml(drinks)}</td>
          <td>${escapeHtml(allergies)}</td>
          <td>${escapeHtml(row.playlist_song || "—")}</td>
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
        width: min(1440px, calc(100% - 32px));
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
        min-width: 1260px;
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

      .nowrap {
        white-space: nowrap;
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
                    <th>Телефон</th>
                    <th>Присутствие</th>
                    <th>Гости</th>
                    <th>Напитки</th>
                    <th>Аллергия</th>
                    <th>Песня</th>
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
      INSERT INTO rsvp_submissions (
        full_name,
        phone,
        attendance,
        guests,
        drinks,
        drink_other,
        has_allergies,
        allergies,
        playlist_song
      )
      VALUES ($1, $2, $3, $4::JSONB, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [
      value.fullName,
      value.phone,
      value.attendance,
      JSON.stringify(value.guests),
      value.drinks,
      value.drinkOther,
      value.hasAllergies,
      value.allergies,
      value.playlistSong,
    ],
  );

  response.status(201).json({ id: result.rows[0].id });
}));

app.get("/admin", requireAdmin, asyncHandler(async (request, response) => {
  const result = await pool.query(`
    SELECT
      id,
      full_name,
      phone,
      attendance,
      guests,
      drinks,
      drink_other,
      has_allergies,
      allergies,
      playlist_song,
      created_at
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
