const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3300);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, "jamal-profile.db"));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Jamal@3300";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_en TEXT NOT NULL,
    title_ar TEXT,
    slug TEXT NOT NULL UNIQUE,
    category TEXT,
    summary_en TEXT,
    summary_ar TEXT,
    hero_image TEXT,
    tags TEXT,
    content_en TEXT,
    content_ar TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trainings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_en TEXT NOT NULL,
    title_ar TEXT,
    slug TEXT NOT NULL UNIQUE,
    category TEXT,
    level TEXT,
    duration TEXT,
    summary_en TEXT,
    summary_ar TEXT,
    hero_image TEXT,
    video_links TEXT,
    sections TEXT,
    quiz TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

seedDatabase();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Jamal profile platform running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/blogs") {
    const includeDrafts = url.searchParams.get("all") === "1";
    if (includeDrafts) {
      requireAdmin(req);
    }
    const rows = includeDrafts
      ? db.prepare("SELECT * FROM blog_posts ORDER BY created_at DESC").all()
      : db.prepare("SELECT * FROM blog_posts WHERE status = 'published' ORDER BY created_at DESC").all();
    sendJson(res, 200, rows.map(mapBlog));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/blogs/")) {
    const slug = decodeURIComponent(url.pathname.replace("/api/blogs/", ""));
    const row = db.prepare("SELECT * FROM blog_posts WHERE slug = ? OR id = ?").get(slug, Number(slug) || 0);
    if (!row) {
      sendJson(res, 404, { error: "Blog post not found" });
      return;
    }
    if (row.status !== "published") {
      requireAdmin(req);
    }
    sendJson(res, 200, mapBlog(row));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/blogs") {
    requireAdmin(req);
    const body = await readJson(req);
    const slug = uniqueSlug("blog_posts", body.slug || body.title_en);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO blog_posts
      (title_en, title_ar, slug, category, summary_en, summary_ar, hero_image, tags, content_en, content_ar, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clean(body.title_en),
      clean(body.title_ar),
      slug,
      clean(body.category),
      clean(body.summary_en),
      clean(body.summary_ar),
      clean(body.hero_image),
      clean(body.tags),
      clean(body.content_en),
      clean(body.content_ar),
      body.status === "draft" ? "draft" : "published",
      now,
      now
    );

    sendJson(res, 201, { ok: true, slug });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/blogs/")) {
    requireAdmin(req);
    const id = Number(url.pathname.replace("/api/blogs/", ""));
    const existing = db.prepare("SELECT * FROM blog_posts WHERE id = ?").get(id);
    if (!existing) {
      sendJson(res, 404, { error: "Blog post not found" });
      return;
    }

    const body = await readJson(req);
    const requestedSlug = clean(body.slug) || slugify(body.title_en || existing.title_en);
    const slug = uniqueSlugExcept("blog_posts", requestedSlug, id);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE blog_posts
      SET title_en = ?, title_ar = ?, slug = ?, category = ?, summary_en = ?, summary_ar = ?,
          hero_image = ?, tags = ?, content_en = ?, content_ar = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      clean(body.title_en),
      clean(body.title_ar),
      slug,
      clean(body.category),
      clean(body.summary_en),
      clean(body.summary_ar),
      clean(body.hero_image),
      clean(body.tags),
      clean(body.content_en),
      clean(body.content_ar),
      body.status === "draft" ? "draft" : "published",
      now,
      id
    );

    sendJson(res, 200, { ok: true, slug });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/trainings") {
    const includeDrafts = url.searchParams.get("all") === "1";
    if (includeDrafts) {
      requireAdmin(req);
    }
    const rows = includeDrafts
      ? db.prepare("SELECT * FROM trainings ORDER BY created_at DESC").all()
      : db.prepare("SELECT * FROM trainings WHERE status = 'published' ORDER BY created_at DESC").all();
    sendJson(res, 200, rows.map(mapTraining));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/trainings/")) {
    const slug = decodeURIComponent(url.pathname.replace("/api/trainings/", ""));
    const row = db.prepare("SELECT * FROM trainings WHERE slug = ? OR id = ?").get(slug, Number(slug) || 0);
    if (!row) {
      sendJson(res, 404, { error: "Training not found" });
      return;
    }
    if (row.status !== "published") {
      requireAdmin(req);
    }
    sendJson(res, 200, mapTraining(row));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/trainings") {
    requireAdmin(req);
    const body = await readJson(req);
    const slug = uniqueSlug("trainings", body.slug || body.title_en);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO trainings
      (title_en, title_ar, slug, category, level, duration, summary_en, summary_ar, hero_image, video_links, sections, quiz, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clean(body.title_en),
      clean(body.title_ar),
      slug,
      clean(body.category),
      clean(body.level),
      clean(body.duration),
      clean(body.summary_en),
      clean(body.summary_ar),
      clean(body.hero_image),
      JSON.stringify(toArray(body.video_links)),
      JSON.stringify(toArray(body.sections)),
      JSON.stringify(toArray(body.quiz)),
      body.status === "draft" ? "draft" : "published",
      now,
      now
    );

    sendJson(res, 201, { ok: true, slug });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/trainings/")) {
    requireAdmin(req);
    const id = Number(url.pathname.replace("/api/trainings/", ""));
    const existing = db.prepare("SELECT * FROM trainings WHERE id = ?").get(id);
    if (!existing) {
      sendJson(res, 404, { error: "Training not found" });
      return;
    }

    const body = await readJson(req);
    const requestedSlug = clean(body.slug) || slugify(body.title_en || existing.title_en);
    const slug = uniqueSlugExcept("trainings", requestedSlug, id);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE trainings
      SET title_en = ?, title_ar = ?, slug = ?, category = ?, level = ?, duration = ?,
          summary_en = ?, summary_ar = ?, hero_image = ?, video_links = ?, sections = ?,
          quiz = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      clean(body.title_en),
      clean(body.title_ar),
      slug,
      clean(body.category),
      clean(body.level),
      clean(body.duration),
      clean(body.summary_en),
      clean(body.summary_ar),
      clean(body.hero_image),
      JSON.stringify(toArray(body.video_links)),
      JSON.stringify(toArray(body.sections)),
      JSON.stringify(toArray(body.quiz)),
      body.status === "draft" ? "draft" : "published",
      now,
      id
    );

    sendJson(res, 200, { ok: true, slug });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/blogs/")) {
    requireAdmin(req);
    const id = Number(url.pathname.replace("/api/blogs/", ""));
    db.prepare("DELETE FROM blog_posts WHERE id = ?").run(id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/trainings/")) {
    requireAdmin(req);
    const id = Number(url.pathname.replace("/api/trainings/", ""));
    db.prepare("DELETE FROM trainings WHERE id = ?").run(id);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(requestPath, res) {
  let filePath = requestPath === "/" ? "/index.html" : requestPath;
  filePath = decodeURIComponent(filePath);

  const resolved = path.resolve(ROOT, `.${filePath}`);
  if (!resolved.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

function requireAdmin(req) {
  const provided = req.headers["x-admin-password"];
  if (provided !== ADMIN_PASSWORD) {
    const error = new Error("Invalid admin password");
    error.statusCode = 401;
    throw error;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function slugify(value) {
  const raw = clean(value) || crypto.randomUUID();
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || crypto.randomUUID();
}

function uniqueSlug(table, value) {
  const base = slugify(value);
  let slug = base;
  let count = 2;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);

  while (stmt.get(slug)) {
    slug = `${base}-${count}`;
    count += 1;
  }

  return slug;
}

function uniqueSlugExcept(table, value, id) {
  const base = slugify(value);
  let slug = base;
  let count = 2;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`);

  while (stmt.get(slug, id)) {
    slug = `${base}-${count}`;
    count += 1;
  }

  return slug;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapBlog(row) {
  return {
    ...row,
    tags: clean(row.tags).split(",").map((tag) => tag.trim()).filter(Boolean)
  };
}

function mapTraining(row) {
  return {
    ...row,
    video_links: parseJson(row.video_links, []),
    sections: parseJson(row.sections, []),
    quiz: parseJson(row.quiz, [])
  };
}

function seedDatabase() {
  const blogCount = db.prepare("SELECT COUNT(*) AS count FROM blog_posts").get().count;
  const trainingCount = db.prepare("SELECT COUNT(*) AS count FROM trainings").get().count;
  const hero = "assets/jamal-ahmed-profile-enhanced.png";

  if (!blogCount) {
    db.prepare(`
      INSERT INTO blog_posts
      (title_en, title_ar, slug, category, summary_en, summary_ar, hero_image, tags, content_en, content_ar, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "How AI Can Improve Supply Chain Planning",
      "كيف يحسن الذكاء الاصطناعي تخطيط سلاسل الإمداد",
      "how-ai-can-improve-supply-chain-planning",
      "AI in Supply Chain",
      "A practical view of how AI tools can support demand planning, reporting, exception analysis, and better management visibility.",
      "نظرة عملية حول كيفية استخدام أدوات الذكاء الاصطناعي لدعم تخطيط الطلب والتقارير وتحليل الاستثناءات.",
      hero,
      "AI,Supply Chain,Planning",
      "AI does not replace supply chain experience. It becomes powerful when it is connected to clean data, clear processes, and practical decisions. Companies can use AI to summarize demand changes, detect risks, prepare management reports, and support planning teams with faster analysis.",
      "الذكاء الاصطناعي لا يستبدل خبرة سلاسل الإمداد، لكنه يصبح قويا عندما يرتبط ببيانات واضحة وعمليات منظمة وقرارات عملية.",
      "published"
    );
  }

  if (!trainingCount) {
    db.prepare(`
      INSERT INTO trainings
      (title_en, title_ar, slug, category, level, duration, summary_en, summary_ar, hero_image, video_links, sections, quiz, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "ChatGPT and AI Tools for Business Teams",
      "شات جي بي تي وأدوات الذكاء الاصطناعي لفرق الأعمال",
      "chatgpt-ai-tools-for-business-teams",
      "AI Tools",
      "Beginner to Intermediate",
      "4 hours",
      "A practical training program for managers and teams who want to use ChatGPT, Codex, Claude, and AI tools in daily business work.",
      "برنامج تدريبي عملي للمديرين والفرق لاستخدام ChatGPT وCodex وClaude وأدوات الذكاء الاصطناعي في العمل اليومي.",
      hero,
      JSON.stringify(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]),
      JSON.stringify([
        { title: "AI tools in business", description: "How to choose the right tool for the right task." },
        { title: "Prompting for useful outputs", description: "How to write clear prompts for reports, analysis, and decisions." },
        { title: "Building simple AI workflows", description: "How teams can save time using repeatable AI workflows." }
      ]),
      JSON.stringify([
        {
          question: "What is the best first step before using AI for business analysis?",
          options: ["Clarify the business question", "Ignore data quality", "Use any random prompt", "Skip review"],
          answer: 0
        },
        {
          question: "Why should AI outputs be reviewed by a business user?",
          options: ["To ensure accuracy and context", "To slow down the process", "To avoid using data", "It is never needed"],
          answer: 0
        }
      ]),
      "published"
    );
  }
}
