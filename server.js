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
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");
const MAX_RESTORE_BYTES = Number(process.env.MAX_RESTORE_BYTES || 100_000_000);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db = openDatabase();
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

function openDatabase() {
  const database = new DatabaseSync(DB_PATH);
  database.exec(`
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
  return database;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/admin/status") {
    requireAdmin(req);
    sendJson(res, 200, getSystemStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/backup/sqlite") {
    requireAdmin(req);
    sendSqliteBackup(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/backup/content") {
    requireAdmin(req);
    sendContentBackup(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/restore/content") {
    requireAdmin(req);
    const body = await readJson(req);
    const result = restoreContentBackup(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/restore/sqlite") {
    requireAdmin(req);
    const buffer = await readBodyBuffer(req, MAX_RESTORE_BYTES);
    const result = restoreSqliteBackup(buffer);
    sendJson(res, 200, result);
    return;
  }

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
      if (body.length > MAX_RESTORE_BYTES) {
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

function readBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Uploaded file is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
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

function sendDownload(res, statusCode, contentType, filename, payload) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function sendFileDownload(res, filePath, filename) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: "Database file not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": stat.size,
      "Cache-Control": "no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function getSystemStatus() {
  const dbStat = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;
  const blogCount = db.prepare("SELECT COUNT(*) AS count FROM blog_posts").get().count;
  const trainingCount = db.prepare("SELECT COUNT(*) AS count FROM trainings").get().count;
  const draftBlogCount = db.prepare("SELECT COUNT(*) AS count FROM blog_posts WHERE status = 'draft'").get().count;
  const draftTrainingCount = db.prepare("SELECT COUNT(*) AS count FROM trainings WHERE status = 'draft'").get().count;
  const relativeDbPath = path.relative(ROOT, DB_PATH);
  const dbInsideDeployment = !relativeDbPath.startsWith("..") && !path.isAbsolute(relativeDbPath);

  return {
    server_time: new Date().toISOString(),
    node_version: process.version,
    environment: process.env.NODE_ENV || "local",
    database_path: DB_PATH,
    database_folder: path.dirname(DB_PATH),
    database_inside_deployment: dbInsideDeployment,
    database_mode: dbInsideDeployment ? "Deployment folder" : "External persistent folder",
    database_size_bytes: dbStat ? dbStat.size : 0,
    database_updated_at: dbStat ? dbStat.mtime.toISOString() : "",
    blog_count: blogCount,
    training_count: trainingCount,
    draft_blog_count: draftBlogCount,
    draft_training_count: draftTrainingCount,
    backup_recommendation: dbInsideDeployment
      ? "Move DB_PATH to a persistent Hostinger folder outside the GitHub deployment directory."
      : "Good: DB_PATH points outside the deployment folder."
  };
}

function sendSqliteBackup(res) {
  db.exec("PRAGMA wal_checkpoint(FULL);");
  const filename = `jamal-profile-sqlite-${backupStamp()}.db`;
  sendFileDownload(res, DB_PATH, filename);
}

function sendContentBackup(res) {
  const blogs = db.prepare("SELECT * FROM blog_posts ORDER BY created_at DESC").all().map(mapBlog);
  const trainings = db.prepare("SELECT * FROM trainings ORDER BY created_at DESC").all().map(mapTraining);
  const payload = JSON.stringify({
    exported_at: new Date().toISOString(),
    source: "Jamal Ahmed Profile Platform",
    counts: {
      blogs: blogs.length,
      trainings: trainings.length
    },
    blogs,
    trainings
  }, null, 2);

  sendDownload(
    res,
    200,
    "application/json; charset=utf-8",
    `jamal-profile-content-${backupStamp()}.json`,
    payload
  );
}

function restoreContentBackup(payload) {
  if (!payload || !Array.isArray(payload.blogs) || !Array.isArray(payload.trainings)) {
    const error = new Error("Invalid content backup file");
    error.statusCode = 400;
    throw error;
  }

  const safetyBackup = backupCurrentDatabase("before-content-restore");
  db.exec("BEGIN IMMEDIATE;");

  try {
    db.prepare("DELETE FROM blog_posts").run();
    db.prepare("DELETE FROM trainings").run();

    const blogInsert = db.prepare(`
      INSERT INTO blog_posts
      (id, title_en, title_ar, slug, category, summary_en, summary_ar, hero_image, tags, content_en, content_ar, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    payload.blogs.forEach((blog) => {
      blogInsert.run(
        positiveId(blog.id),
        clean(blog.title_en) || "Untitled Blog Post",
        clean(blog.title_ar),
        clean(blog.slug) || uniqueSlug("blog_posts", blog.title_en),
        clean(blog.category),
        clean(blog.summary_en),
        clean(blog.summary_ar),
        clean(blog.hero_image),
        Array.isArray(blog.tags) ? blog.tags.join(", ") : clean(blog.tags),
        clean(blog.content_en),
        clean(blog.content_ar),
        blog.status === "draft" ? "draft" : "published",
        validDate(blog.created_at),
        validDate(blog.updated_at)
      );
    });

    const trainingInsert = db.prepare(`
      INSERT INTO trainings
      (id, title_en, title_ar, slug, category, level, duration, summary_en, summary_ar, hero_image, video_links, sections, quiz, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    payload.trainings.forEach((training) => {
      trainingInsert.run(
        positiveId(training.id),
        clean(training.title_en) || "Untitled Training Program",
        clean(training.title_ar),
        clean(training.slug) || uniqueSlug("trainings", training.title_en),
        clean(training.category),
        clean(training.level),
        clean(training.duration),
        clean(training.summary_en),
        clean(training.summary_ar),
        clean(training.hero_image),
        JSON.stringify(toArray(training.video_links)),
        JSON.stringify(toArray(training.sections)),
        JSON.stringify(toArray(training.quiz)),
        training.status === "draft" ? "draft" : "published",
        validDate(training.created_at),
        validDate(training.updated_at)
      );
    });

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return {
    ok: true,
    restored: {
      blogs: payload.blogs.length,
      trainings: payload.trainings.length
    },
    safety_backup: safetyBackup
  };
}

function restoreSqliteBackup(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) {
    const error = new Error("Invalid SQLite backup file");
    error.statusCode = 400;
    throw error;
  }

  if (buffer.subarray(0, 16).toString("utf8") !== "SQLite format 3\u0000") {
    const error = new Error("Uploaded file is not a SQLite database");
    error.statusCode = 400;
    throw error;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const tempPath = path.join(BACKUP_DIR, `restore-upload-${backupStamp()}.db`);
  fs.writeFileSync(tempPath, buffer);
  validateSqliteDatabase(tempPath);
  const safetyBackup = backupCurrentDatabase("before-sqlite-restore");

  db.close();
  fs.copyFileSync(tempPath, DB_PATH);
  removeIfExists(`${DB_PATH}-wal`);
  removeIfExists(`${DB_PATH}-shm`);
  removeIfExists(tempPath);
  db = openDatabase();
  seedDatabase();

  return {
    ok: true,
    restored_database: DB_PATH,
    safety_backup: safetyBackup
  };
}

function backupCurrentDatabase(reason) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  db.exec("PRAGMA wal_checkpoint(FULL);");
  const backupPath = path.join(BACKUP_DIR, `${reason}-${backupStamp()}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  return backupPath;
}

function validateSqliteDatabase(filePath) {
  let uploadedDb;
  try {
    uploadedDb = new DatabaseSync(filePath, { readOnly: true });
    const result = uploadedDb.prepare("PRAGMA integrity_check;").get();
    const value = result && Object.values(result)[0];
    if (value !== "ok") {
      throw new Error("SQLite integrity check failed");
    }
    const hasBlogs = uploadedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'blog_posts'").get();
    const hasTrainings = uploadedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trainings'").get();
    if (!hasBlogs || !hasTrainings) {
      throw new Error("SQLite file does not match this website database schema");
    }
  } finally {
    if (uploadedDb) {
      uploadedDb.close();
    }
  }
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function removeIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
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
