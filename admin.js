(function () {
  var storageKey = "jamal-theme";
  var passwordKey = "jamal-admin-password";
  var body = document.body;
  var toggle = document.querySelector(".theme-toggle");
  var toggleText = document.querySelector(".toggle-text");
  var password = sessionStorage.getItem(passwordKey) || "";
  var currentBlogs = [];
  var currentTrainings = [];

  document.documentElement.classList.add("js");
  setupTheme();
  setupLogin();
  setupTabs();
  setupDynamicForms();
  setupBlogForm();
  setupTrainingForm();
  setupSettings();

  if (password) {
    unlockAdmin();
  }

  function setupTheme() {
    var saved = localStorage.getItem(storageKey);
    var theme = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(theme);

    if (toggle) {
      toggle.addEventListener("click", function () {
        var nextTheme = body.classList.contains("dark-mode") ? "light" : "dark";
        localStorage.setItem(storageKey, nextTheme);
        applyTheme(nextTheme);
      });
    }
  }

  function applyTheme(theme) {
    var isDark = theme === "dark";
    body.classList.toggle("dark-mode", isDark);

    if (toggle) {
      toggle.setAttribute("aria-pressed", String(isDark));
    }

    if (toggleText) {
      toggleText.textContent = isDark ? "Light" : "Dark";
    }
  }

  function setupLogin() {
    var form = document.querySelector("#login-form");

    if (!form) {
      return;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      password = document.querySelector("#admin-password").value;
      sessionStorage.setItem(passwordKey, password);
      unlockAdmin();
    });
  }

  async function unlockAdmin() {
    document.querySelector("#login-panel").hidden = true;
    document.querySelector("#content-manager").hidden = false;
    await refreshExisting();
    await refreshSettings();
  }

  function setupTabs() {
    document.querySelectorAll("[data-admin-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        activateTab(button.getAttribute("data-admin-tab"));
      });
    });
  }

  function activateTab(target) {
    document.querySelectorAll("[data-admin-tab]").forEach(function (tab) {
      tab.classList.toggle("active", tab.getAttribute("data-admin-tab") === target);
    });

    document.querySelectorAll(".admin-section").forEach(function (section) {
      section.hidden = section.id !== target;
    });

    if (target === "settings-admin") {
      refreshSettings();
    }
  }

  function setupDynamicForms() {
    document.querySelector("#add-video").addEventListener("click", function () {
      addVideoRow();
    });
    document.querySelector("#add-section").addEventListener("click", function () {
      addSectionRow();
    });
    document.querySelector("#add-quiz").addEventListener("click", function () {
      addQuizRow();
    });
    document.querySelector("#blog-reset").addEventListener("click", resetBlogForm);
    document.querySelector("#training-reset").addEventListener("click", resetTrainingForm);
    resetTrainingDynamicRows();
  }

  function addVideoRow(value) {
    var list = document.querySelector("#video-list");
    var row = document.createElement("div");
    row.className = "dynamic-row";
    row.innerHTML = '<input class="video-input" placeholder="YouTube, Vimeo, or external video link" value="' + escapeAttr(value || "") + '"><button class="button ghost" type="button">Remove</button>';
    row.querySelector("button").addEventListener("click", function () {
      row.remove();
    });
    list.appendChild(row);
  }

  function addSectionRow(section) {
    var list = document.querySelector("#section-list");
    var row = document.createElement("div");
    row.className = "dynamic-row multi";
    row.innerHTML = [
      '<input class="section-title" placeholder="Section title" value="' + escapeAttr(section && section.title || "") + '">',
      '<textarea class="section-description" placeholder="Section description">' + escapeHtml(section && section.description || "") + '</textarea>',
      '<button class="button ghost" type="button">Remove Section</button>'
    ].join("");
    row.querySelector("button").addEventListener("click", function () {
      row.remove();
    });
    list.appendChild(row);
  }

  function addQuizRow(question) {
    var list = document.querySelector("#quiz-list");
    var row = document.createElement("div");
    row.className = "dynamic-row multi";
    var options = question && question.options || [];
    row.innerHTML = [
      '<input class="quiz-question" placeholder="Question" value="' + escapeAttr(question && question.question || "") + '">',
      '<input class="quiz-option" placeholder="Option 1" value="' + escapeAttr(options[0] || "") + '">',
      '<input class="quiz-option" placeholder="Option 2" value="' + escapeAttr(options[1] || "") + '">',
      '<input class="quiz-option" placeholder="Option 3" value="' + escapeAttr(options[2] || "") + '">',
      '<input class="quiz-option" placeholder="Option 4" value="' + escapeAttr(options[3] || "") + '">',
      '<label><span>Correct Answer</span><select class="quiz-answer"><option value="0">Option 1</option><option value="1">Option 2</option><option value="2">Option 3</option><option value="3">Option 4</option></select></label>',
      '<button class="button ghost" type="button">Remove Question</button>'
    ].join("");
    row.querySelector(".quiz-answer").value = String(question && Number.isInteger(question.answer) ? question.answer : 0);
    row.querySelector("button").addEventListener("click", function () {
      row.remove();
    });
    list.appendChild(row);
  }

  function setupBlogForm() {
    var form = document.querySelector("#blog-form");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var status = document.querySelector("#blog-status");
      var id = form.elements.id.value;
      var payload = await formPayload(form);
      status.textContent = id ? "Saving blog changes..." : "Saving blog post...";

      try {
        await saveJson(id ? "/api/blogs/" + id : "/api/blogs", id ? "PUT" : "POST", payload);
        resetBlogForm();
        status.textContent = id ? "Blog post updated successfully." : "Blog post published successfully.";
        await refreshExisting();
      } catch (error) {
        status.textContent = "Could not save blog post. Check the password and try again.";
      }
    });
  }

  function setupTrainingForm() {
    var form = document.querySelector("#training-form");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var status = document.querySelector("#training-status");
      var id = form.elements.id.value;
      var payload = await formPayload(form);
      payload.video_links = collectVideos();
      payload.sections = collectSections();
      payload.quiz = collectQuiz();
      status.textContent = id ? "Saving training changes..." : "Saving training program...";

      try {
        await saveJson(id ? "/api/trainings/" + id : "/api/trainings", id ? "PUT" : "POST", payload);
        resetTrainingForm();
        status.textContent = id ? "Training program updated successfully." : "Training program published successfully.";
        await refreshExisting();
      } catch (error) {
        status.textContent = "Could not save training. Check the password and try again.";
      }
    });
  }

  async function formPayload(form) {
    var data = new FormData(form);
    var payload = {};
    data.forEach(function (value, key) {
      if (key !== "hero_file" && key !== "id") {
        payload[key] = typeof value === "string" ? value.trim() : value;
      }
    });

    var file = data.get("hero_file");
    if (file && file.size) {
      payload.hero_image = await readFileAsDataUrl(file);
    }

    return payload;
  }

  function collectVideos() {
    return Array.from(document.querySelectorAll(".video-input"))
      .map(function (input) { return input.value.trim(); })
      .filter(Boolean);
  }

  function collectSections() {
    return Array.from(document.querySelectorAll("#section-list .dynamic-row")).map(function (row) {
      return {
        title: row.querySelector(".section-title").value.trim(),
        description: row.querySelector(".section-description").value.trim()
      };
    }).filter(function (section) {
      return section.title || section.description;
    });
  }

  function collectQuiz() {
    return Array.from(document.querySelectorAll("#quiz-list .dynamic-row")).map(function (row) {
      return {
        question: row.querySelector(".quiz-question").value.trim(),
        options: Array.from(row.querySelectorAll(".quiz-option")).map(function (input) { return input.value.trim(); }).filter(Boolean),
        answer: Number(row.querySelector(".quiz-answer").value)
      };
    }).filter(function (item) {
      return item.question && item.options.length >= 2;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function saveJson(url, method, payload) {
    var response = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Save failed");
    }

    return response.json();
  }

  async function deleteItem(type, id) {
    var response = await fetch("/api/" + type + "/" + id, {
      method: "DELETE",
      headers: { "x-admin-password": password }
    });

    if (!response.ok) {
      throw new Error("Delete failed");
    }
  }

  function setupSettings() {
    var refreshButton = document.querySelector("#refresh-settings");
    var sqliteButton = document.querySelector("#download-sqlite-backup");
    var contentButton = document.querySelector("#download-content-backup");

    if (refreshButton) {
      refreshButton.addEventListener("click", refreshSettings);
    }

    if (sqliteButton) {
      sqliteButton.addEventListener("click", function () {
        downloadAdminFile("/api/admin/backup/sqlite", "settings-status", "Preparing SQLite backup...");
      });
    }

    if (contentButton) {
      contentButton.addEventListener("click", function () {
        downloadAdminFile("/api/admin/backup/content", "settings-status", "Preparing content JSON export...");
      });
    }
  }

  async function refreshSettings() {
    var target = document.querySelector("#system-status");
    var status = document.querySelector("#settings-status");

    if (!target || !password) {
      return;
    }

    try {
      var info = await getJson("/api/admin/status");
      target.innerHTML = [
        statusRow("Database Mode", info.database_mode),
        statusRow("Database Path", info.database_path),
        statusRow("Database Folder", info.database_folder),
        statusRow("Database Size", formatBytes(info.database_size_bytes)),
        statusRow("Database Updated", formatDate(info.database_updated_at)),
        statusRow("Blogs", String(info.blog_count) + " total, " + String(info.draft_blog_count) + " draft"),
        statusRow("Training Programs", String(info.training_count) + " total, " + String(info.draft_training_count) + " draft"),
        statusRow("Server Time", formatDate(info.server_time)),
        statusRow("Node.js", info.node_version),
        statusRow("Recommendation", info.backup_recommendation)
      ].join("");

      if (status) {
        status.textContent = info.database_inside_deployment
          ? "Warning: database is still inside the deployment folder. Set DB_PATH on Hostinger before production updates."
          : "Good: database is using an external persistent folder.";
      }
    } catch {
      target.innerHTML = "<p>Could not load system status. Check the admin password.</p>";
      if (status) {
        status.textContent = "Settings status could not be loaded.";
      }
    }
  }

  async function downloadAdminFile(url, statusId, loadingMessage) {
    var status = document.querySelector("#" + statusId);
    if (status) {
      status.textContent = loadingMessage;
    }

    try {
      var response = await fetch(url, { headers: { "x-admin-password": password } });
      if (!response.ok) {
        throw new Error("Download failed");
      }

      var blob = await response.blob();
      var filename = filenameFromDisposition(response.headers.get("Content-Disposition")) || "jamal-profile-backup";
      var objectUrl = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      if (status) {
        status.textContent = "Backup download started: " + filename;
      }
    } catch {
      if (status) {
        status.textContent = "Could not download backup. Check password and server permissions.";
      }
    }
  }

  function statusRow(label, value) {
    return '<div class="status-row"><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value || "-") + '</span></div>';
  }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) {
      return value + " B";
    }
    if (value < 1024 * 1024) {
      return (value / 1024).toFixed(1) + " KB";
    }
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function filenameFromDisposition(disposition) {
    var match = /filename="([^"]+)"/.exec(disposition || "");
    return match ? match[1] : "";
  }

  async function refreshExisting() {
    try {
      currentBlogs = await getJson("/api/blogs?all=1");
      currentTrainings = await getJson("/api/trainings?all=1");
      renderExisting("existing-blogs", currentBlogs, "blogs");
      renderExisting("existing-trainings", currentTrainings, "trainings");
    } catch {
      document.querySelector("#login-panel").hidden = false;
      document.querySelector("#content-manager").hidden = true;
      document.querySelector("#login-status").textContent = "Enter the correct admin password.";
      sessionStorage.removeItem(passwordKey);
    }
  }

  function renderExisting(targetId, items, type) {
    var target = document.querySelector("#" + targetId);

    if (!items.length) {
      target.innerHTML = '<article><span>No content yet.</span></article>';
      return;
    }

    target.innerHTML = items.map(function (item) {
      return [
        '<article>',
        '<div><strong>' + escapeHtml(item.title_en) + '</strong><br><span class="meta-line">' + escapeHtml(item.status || "published") + '</span></div>',
        '<div class="row-actions">',
        '<button class="button secondary small-button" type="button" data-edit-type="' + type + '" data-edit-id="' + item.id + '">Edit</button>',
        '<button class="button ghost small-button" type="button" data-delete-type="' + type + '" data-delete-id="' + item.id + '">Delete</button>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");

    target.querySelectorAll("[data-edit-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        editItem(button.getAttribute("data-edit-type"), Number(button.getAttribute("data-edit-id")));
      });
    });

    target.querySelectorAll("[data-delete-id]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var confirmed = window.confirm("Delete this item permanently?");
        if (!confirmed) {
          return;
        }

        await deleteItem(button.getAttribute("data-delete-type"), button.getAttribute("data-delete-id"));
        await refreshExisting();
      });
    });
  }

  function editItem(type, id) {
    if (type === "blogs") {
      var blog = currentBlogs.find(function (item) { return item.id === id; });
      if (blog) {
        fillBlogForm(blog);
      }
      return;
    }

    var training = currentTrainings.find(function (item) { return item.id === id; });
    if (training) {
      fillTrainingForm(training);
    }
  }

  function fillBlogForm(blog) {
    var form = document.querySelector("#blog-form");
    activateTab("blog-admin");
    form.reset();
    form.elements.id.value = blog.id;
    form.elements.title_en.value = blog.title_en || "";
    form.elements.title_ar.value = blog.title_ar || "";
    form.elements.category.value = blog.category || "";
    form.elements.tags.value = Array.isArray(blog.tags) ? blog.tags.join(", ") : blog.tags || "";
    form.elements.hero_image.value = blog.hero_image || "";
    form.elements.summary_en.value = blog.summary_en || "";
    form.elements.summary_ar.value = blog.summary_ar || "";
    form.elements.content_en.value = blog.content_en || "";
    form.elements.content_ar.value = blog.content_ar || "";
    form.elements.status.value = blog.status === "draft" ? "draft" : "published";
    document.querySelector("#blog-form-title").textContent = "Edit Blog Post";
    document.querySelector("#blog-submit").textContent = "Save Blog Changes";
    document.querySelector("#blog-status").textContent = "Editing: " + blog.title_en;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillTrainingForm(training) {
    var form = document.querySelector("#training-form");
    activateTab("training-admin");
    form.reset();
    form.elements.id.value = training.id;
    form.elements.title_en.value = training.title_en || "";
    form.elements.title_ar.value = training.title_ar || "";
    form.elements.category.value = training.category || "";
    form.elements.level.value = training.level || "";
    form.elements.duration.value = training.duration || "";
    form.elements.status.value = training.status === "draft" ? "draft" : "published";
    form.elements.hero_image.value = training.hero_image || "";
    form.elements.summary_en.value = training.summary_en || "";
    form.elements.summary_ar.value = training.summary_ar || "";

    document.querySelector("#video-list").innerHTML = "";
    (training.video_links && training.video_links.length ? training.video_links : [""]).forEach(addVideoRow);
    document.querySelector("#section-list").innerHTML = "";
    (training.sections && training.sections.length ? training.sections : [{}]).forEach(addSectionRow);
    document.querySelector("#quiz-list").innerHTML = "";
    (training.quiz && training.quiz.length ? training.quiz : [{}]).forEach(addQuizRow);

    document.querySelector("#training-form-title").textContent = "Edit Training Program";
    document.querySelector("#training-submit").textContent = "Save Training Changes";
    document.querySelector("#training-status").textContent = "Editing: " + training.title_en;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetBlogForm() {
    var form = document.querySelector("#blog-form");
    form.reset();
    form.elements.id.value = "";
    document.querySelector("#blog-form-title").textContent = "Add Blog Post";
    document.querySelector("#blog-submit").textContent = "Publish Blog Post";
    document.querySelector("#blog-status").textContent = "";
  }

  function resetTrainingForm() {
    var form = document.querySelector("#training-form");
    form.reset();
    form.elements.id.value = "";
    resetTrainingDynamicRows();
    document.querySelector("#training-form-title").textContent = "Add Training Program";
    document.querySelector("#training-submit").textContent = "Publish Training";
    document.querySelector("#training-status").textContent = "";
  }

  function resetTrainingDynamicRows() {
    document.querySelector("#video-list").innerHTML = "";
    document.querySelector("#section-list").innerHTML = "";
    document.querySelector("#quiz-list").innerHTML = "";
    addVideoRow();
    addSectionRow();
    addQuizRow();
  }

  async function getJson(url) {
    var response = await fetch(url, { headers: password ? { "x-admin-password": password } : {} });
    if (!response.ok) {
      throw new Error("Request failed");
    }
    return response.json();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
}());
