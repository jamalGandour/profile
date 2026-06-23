(function () {
  var storageKey = "jamal-theme";
  var body = document.body;
  var toggle = document.querySelector(".theme-toggle");
  var toggleText = document.querySelector(".toggle-text");
  var menuToggle = document.querySelector(".menu-toggle");
  var primaryNav = document.querySelector("#primary-nav");
  var modal = document.querySelector("#content-modal");
  var modalBody = document.querySelector("#modal-body");
  var modalClose = document.querySelector(".modal-close");
  var activeQuiz = [];

  document.documentElement.classList.add("js");

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

  function getInitialTheme() {
    var saved = localStorage.getItem(storageKey);

    if (saved === "dark" || saved === "light") {
      return saved;
    }

    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    return "light";
  }

  applyTheme(getInitialTheme());

  if (toggle) {
    toggle.addEventListener("click", function () {
      var nextTheme = body.classList.contains("dark-mode") ? "light" : "dark";
      localStorage.setItem(storageKey, nextTheme);
      applyTheme(nextTheme);
    });
  }

  function setMenu(open) {
    body.classList.toggle("nav-open", open);

    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    }
  }

  if (menuToggle && primaryNav) {
    menuToggle.addEventListener("click", function () {
      setMenu(!body.classList.contains("nav-open"));
    });

    primaryNav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        setMenu(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setMenu(false);
      }
    });
  }

  if (modalClose && modal) {
    modalClose.addEventListener("click", function () {
      modal.setAttribute("hidden", "");
      body.classList.remove("modal-open");
    });

    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        modal.setAttribute("hidden", "");
        body.classList.remove("modal-open");
      }
    });
  }

  loadBlogPosts();
  loadTrainings();
  setupContentActions();
  setupLabAdvisor();
  setupConsultationBrief();
  setupReveal();

  async function loadBlogPosts() {
    var list = document.querySelector("#blog-list");

    if (!list) {
      return;
    }

    try {
      var posts = await getJson("/api/blogs");

      if (!posts.length) {
        list.innerHTML = '<article class="loading-card">No blog posts yet. Add the first post from Admin.</article>';
        return;
      }

      list.innerHTML = posts.map(renderBlogCard).join("");
      setupReveal();
    } catch (error) {
      list.innerHTML = '<article class="loading-card">Blog content is not available. Please start the Node.js server.</article>';
    }
  }

  async function loadTrainings() {
    var list = document.querySelector("#training-list");

    if (!list) {
      return;
    }

    try {
      var trainings = await getJson("/api/trainings");

      if (!trainings.length) {
        list.innerHTML = '<article class="loading-card">No training programs yet. Add the first training from Admin.</article>';
        return;
      }

      list.innerHTML = trainings.map(renderTrainingCard).join("");
      setupReveal();
    } catch (error) {
      list.innerHTML = '<article class="loading-card">Training content is not available. Please start the Node.js server.</article>';
    }
  }

  function renderBlogCard(post) {
    var titleAr = displayableArabic(post.title_ar);
    return [
      '<article class="content-card">',
      imageHtml(post.hero_image, post.title_en),
      '<div class="content-card-body">',
      '<p class="meta-line">' + escapeHtml(post.category || "Blog") + '</p>',
      '<h3>' + escapeHtml(post.title_en) + '</h3>',
      titleAr ? '<p class="arabic-card-title" dir="rtl" lang="ar">' + escapeHtml(titleAr) + '</p>' : "",
      '<p>' + escapeHtml(post.summary_en || "") + '</p>',
      tagHtml(post.tags),
      '<button class="button primary small-button" type="button" data-blog-slug="' + escapeHtml(post.slug) + '">Read Article</button>',
      '</div>',
      '</article>'
    ].join("");
  }

  function renderTrainingCard(training) {
    var titleAr = displayableArabic(training.title_ar);
    var info = trainingSalesInfo(training);
    return [
      '<article class="content-card">',
      imageHtml(training.hero_image, training.title_en),
      '<div class="content-card-body">',
      '<p class="meta-line">' + escapeHtml([training.category, training.level, training.duration].filter(Boolean).join(" | ")) + '</p>',
      '<h3>' + escapeHtml(training.title_en) + '</h3>',
      titleAr ? '<p class="arabic-card-title" dir="rtl" lang="ar">' + escapeHtml(titleAr) + '</p>' : "",
      '<p>' + escapeHtml(training.summary_en || "") + '</p>',
      '<div class="training-info">',
      '<span><strong>Who:</strong> ' + escapeHtml(info.audience) + '</span>',
      '<span><strong>Outcome:</strong> ' + escapeHtml(info.outcome) + '</span>',
      '<span><strong>Certificate:</strong> Available</span>',
      '</div>',
      '<button class="button primary small-button" type="button" data-training-slug="' + escapeHtml(training.slug) + '">Start Training</button>',
      '</div>',
      '</article>'
    ].join("");
  }

  async function openBlog(slug) {
    var post = await getJson("/api/blogs/" + encodeURIComponent(slug));
    var titleAr = displayableArabic(post.title_ar);
    var contentAr = displayableArabic(post.content_ar);
    openModal([
      imageHtml(post.hero_image, post.title_en, "modal-hero"),
      '<p class="meta-line">' + escapeHtml(post.category || "Blog") + '</p>',
      '<h2>' + escapeHtml(post.title_en) + '</h2>',
      titleAr ? '<h3 dir="rtl" lang="ar">' + escapeHtml(titleAr) + '</h3>' : "",
      '<div class="article-body">' + paragraphs(post.content_en) + '</div>',
      contentAr ? '<div class="article-body arabic-article" dir="rtl" lang="ar">' + paragraphs(contentAr) + '</div>' : "",
      tagHtml(post.tags)
    ].join(""));
  }

  function setupContentActions() {
    document.addEventListener("click", function (event) {
      var blogButton = event.target.closest("[data-blog-slug]");
      var trainingButton = event.target.closest("[data-training-slug]");

      if (blogButton) {
        event.preventDefault();
        openBlog(blogButton.getAttribute("data-blog-slug"));
      }

      if (trainingButton) {
        event.preventDefault();
        openTraining(trainingButton.getAttribute("data-training-slug"));
      }
    });
  }

  async function openTraining(slug) {
    var training = await getJson("/api/trainings/" + encodeURIComponent(slug));
    var videos = training.video_links || [];
    var sections = training.sections || [];
    var quiz = training.quiz || [];
    var titleAr = displayableArabic(training.title_ar);
    var summaryAr = displayableArabic(training.summary_ar);
    var info = trainingSalesInfo(training);
    activeQuiz = quiz;

    openModal([
      imageHtml(training.hero_image, training.title_en, "modal-hero"),
      '<p class="meta-line">' + escapeHtml([training.category, training.level, training.duration].filter(Boolean).join(" | ")) + '</p>',
      '<h2>' + escapeHtml(training.title_en) + '</h2>',
      titleAr ? '<h3 dir="rtl" lang="ar">' + escapeHtml(titleAr) + '</h3>' : "",
      '<p>' + escapeHtml(training.summary_en || "") + '</p>',
      summaryAr ? '<p dir="rtl" lang="ar">' + escapeHtml(summaryAr) + '</p>' : "",
      '<div class="training-info modal-training-info">',
      '<span><strong>Who should attend:</strong> ' + escapeHtml(info.audience) + '</span>',
      '<span><strong>Business outcome:</strong> ' + escapeHtml(info.outcome) + '</span>',
      '<span><strong>Certificate:</strong> Available for corporate programs</span>',
      '</div>',
      videos.length ? '<h3>Training Videos</h3><div class="video-grid">' + videos.map(videoPlayer).join("") + '</div>' : "",
      sections.length ? '<h3>Training Sections</h3><div class="lesson-list">' + sections.map(sectionItem).join("") + '</div>' : "",
      quiz.length ? renderQuiz(quiz) : '<p class="meta-line">Quiz will be added soon.</p>'
    ].join(""));
  }

  function renderQuiz(quiz) {
    return [
      '<form class="quiz-form" id="quiz-form">',
      '<h3>Quiz</h3>',
      quiz.map(function (item, index) {
        var options = Array.isArray(item.options) ? item.options : [];
        return [
          '<fieldset>',
          '<legend>' + escapeHtml(index + 1 + ". " + (item.question || "Question")) + '</legend>',
          options.map(function (option, optionIndex) {
            return '<label><input type="radio" name="q' + index + '" value="' + optionIndex + '"> <span>' + escapeHtml(option) + '</span></label>';
          }).join(""),
          '</fieldset>'
        ].join("");
      }).join(""),
      '<button class="button secondary" type="submit">Submit Quiz</button>',
      '<p class="quiz-result" id="quiz-result" aria-live="polite"></p>',
      '</form>'
    ].join("");
  }

  function attachQuizHandler() {
    var form = document.querySelector("#quiz-form");
    var result = document.querySelector("#quiz-result");

    if (!form || !result) {
      return;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var quiz = activeQuiz || [];
      var score = 0;

      quiz.forEach(function (item, index) {
        var selected = form.querySelector('input[name="q' + index + '"]:checked');
        if (selected && Number(selected.value) === Number(item.answer)) {
          score += 1;
        }
      });

      var percent = quiz.length ? Math.round((score / quiz.length) * 100) : 0;
      result.textContent = "Your score: " + score + " / " + quiz.length + " (" + percent + "%)";
    });
  }

  function setupLabAdvisor() {
    var form = document.querySelector("#ai-lab-form");
    var result = document.querySelector("#lab-result");

    if (!form || !result) {
      return;
    }

    var recommendations = {
      inventory: {
        title: "Inventory Risk Agent + Stock Health Dashboard",
        body: "Start with ABC, slow-moving, shortage, expiry, and replenishment rules. Then connect the output to a weekly management dashboard and AI-generated action notes.",
        steps: ["Clean item and stock data", "Define inventory risk rules", "Build dashboard and alert workflow"]
      },
      forecast: {
        title: "Demand Planning Assistant + Forecast Review Routine",
        body: "Build a structured forecast review process supported by historical demand, sales exceptions, customer context, and AI-assisted planning summaries.",
        steps: ["Map demand history and exceptions", "Create forecast review templates", "Train planners on AI-assisted analysis"]
      },
      service: {
        title: "Customer Delivery Follow-Up Agent",
        body: "Use an AI assistant to organize customer requests, delivery risks, pending actions, and follow-up messages across sales, warehouse, and transport teams.",
        steps: ["Define service risk categories", "Create follow-up scripts", "Build delivery action tracker"]
      },
      reporting: {
        title: "Executive KPI Control Tower",
        body: "Replace scattered manual reports with one weekly dashboard for service, inventory, planning, distribution, and cost performance.",
        steps: ["Select leadership KPIs", "Automate data refresh", "Add AI management summary"]
      }
    };

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var challenge = document.querySelector("#lab-challenge").value;
      var data = document.querySelector("#lab-data").value;
      var team = document.querySelector("#lab-team").value;
      var recommendation = recommendations[challenge] || recommendations.inventory;
      var readiness = data === "high" && team === "advanced"
        ? "Ready for a pilot AI agent and custom workflow."
        : data === "low" || team === "starter"
          ? "Start with a focused diagnostic, data cleanup, and team enablement workshop."
          : "Ready for a dashboard-first pilot with selected AI automation.";

      result.innerHTML = [
        '<p class="meta-line">Recommended Starting Point</p>',
        '<h3>' + escapeHtml(recommendation.title) + '</h3>',
        '<p>' + escapeHtml(recommendation.body) + '</p>',
        '<p><strong>' + escapeHtml(readiness) + '</strong></p>',
        '<ul>',
        recommendation.steps.map(function (step) {
          return '<li>' + escapeHtml(step) + '</li>';
        }).join(""),
        '</ul>'
      ].join("");
    });
  }

  function setupConsultationBrief() {
    var link = document.querySelector("#consultation-whatsapp");
    var service = document.querySelector("#consultation-service");
    var priority = document.querySelector("#consultation-priority");
    var timeline = document.querySelector("#consultation-timeline");

    if (!link || !service || !priority || !timeline) {
      return;
    }

    function updateLink() {
      var message = [
        "Hello Jamal Ahmed, I would like to book a free 30-minute Supply Chain & AI Diagnosis Call.",
        "",
        "Service: " + service.value,
        "Priority: " + priority.value,
        "Timeline: " + timeline.value,
        "",
        "Please advise the recommended diagnosis path and next step."
      ].join("\n");

      link.href = "https://wa.me/966509649029?text=" + encodeURIComponent(message);
    }

    [service, priority, timeline].forEach(function (field) {
      field.addEventListener("change", updateLink);
    });

    updateLink();
  }

  function openModal(html) {
    if (!modal || !modalBody) {
      return;
    }

    modalBody.innerHTML = html;
    modal.removeAttribute("hidden");
    body.classList.add("modal-open");
    attachQuizHandler();
  }

  async function getJson(url) {
    var response = await fetch(url);

    if (!response.ok) {
      throw new Error("Request failed");
    }

    return response.json();
  }

  function imageHtml(src, alt, className) {
    var safeSrc = src || "assets/jamal-ahmed-profile-enhanced.png";
    return '<img class="' + escapeHtml(className || "content-image") + '" src="' + escapeHtml(safeSrc) + '" alt="' + escapeHtml(alt || "Content image") + '">';
  }

  function tagHtml(tags) {
    if (!Array.isArray(tags) || !tags.length) {
      return "";
    }

    return '<div class="mini-tags">' + tags.map(function (tag) {
      return '<span>' + escapeHtml(tag) + '</span>';
    }).join("") + '</div>';
  }

  function videoPlayer(link) {
    var embedUrl = toEmbedUrl(link);

    if (embedUrl) {
      return [
        '<article class="video-embed-card">',
        '<div class="video-frame">',
        '<iframe src="' + escapeHtml(embedUrl) + '" title="Training video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>',
        '</div>',
        '<a class="video-link" href="' + escapeHtml(link) + '" target="_blank" rel="noreferrer">Open video in new tab</a>',
        '</article>'
      ].join("");
    }

    return '<a class="video-link" href="' + escapeHtml(link) + '" target="_blank" rel="noreferrer">' + escapeHtml(link) + '</a>';
  }

  function toEmbedUrl(link) {
    try {
      var url = new URL(link);
      var host = url.hostname.replace(/^www\./, "");
      var videoId = "";

      if (host === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0] || "";
        return videoId ? "https://www.youtube.com/embed/" + encodeURIComponent(videoId) : "";
      }

      if (host === "youtube.com" || host === "m.youtube.com") {
        if (url.pathname === "/watch") {
          videoId = url.searchParams.get("v") || "";
        } else if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
          videoId = url.pathname.split("/").filter(Boolean)[1] || "";
        }

        return videoId ? "https://www.youtube.com/embed/" + encodeURIComponent(videoId) : "";
      }

      if (host === "vimeo.com" || host === "player.vimeo.com") {
        var parts = url.pathname.split("/").filter(Boolean);
        videoId = parts[parts.length - 1] || "";
        return videoId ? "https://player.vimeo.com/video/" + encodeURIComponent(videoId) : "";
      }
    } catch {
      return "";
    }

    return "";
  }

  function sectionItem(section) {
    return [
      '<article class="lesson-item">',
      '<h4>' + escapeHtml(section.title || "Training Section") + '</h4>',
      '<p>' + escapeHtml(section.description || "") + '</p>',
      '</article>'
    ].join("");
  }

  function paragraphs(text) {
    return escapeHtml(text || "")
      .split(/\n{2,}/)
      .map(function (paragraph) {
        return '<p>' + paragraph.replace(/\n/g, "<br>") + '</p>';
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function displayableArabic(value) {
    var text = String(value || "").trim();

    if (!text) {
      return "";
    }

    var questionMarks = (text.match(/\?/g) || []).length;
    var hasArabic = /[\u0600-\u06ff]/.test(text);
    var hasMojibake = /[ØÙ]/.test(text);

    if (questionMarks >= 3 || hasMojibake || !hasArabic) {
      return "";
    }

    return text;
  }

  function trainingSalesInfo(training) {
    var title = String(training.title_en || "").toLowerCase();
    var category = String(training.category || "").toLowerCase();

    if (title.includes("inventory") || category.includes("inventory")) {
      return {
        audience: "inventory, planning, warehouse, and supply chain teams",
        outcome: "build stock-health visibility and reduce inventory risk"
      };
    }

    if (title.includes("demand") || category.includes("demand")) {
      return {
        audience: "demand planners, sales planners, supply planners, and managers",
        outcome: "improve forecast review discipline and exception management"
      };
    }

    if (title.includes("dashboard") || category.includes("dashboard")) {
      return {
        audience: "managers, analysts, planners, and reporting owners",
        outcome: "create clearer KPI dashboards and faster management reporting"
      };
    }

    if (title.includes("agent") || category.includes("agent")) {
      return {
        audience: "customer service, sales, inventory, and operations teams",
        outcome: "design practical AI agents with clear business guardrails"
      };
    }

    if (title.includes("ai") || category.includes("ai")) {
      return {
        audience: "managers, supervisors, analysts, and business professionals",
        outcome: "use AI tools safely for analysis, reporting, and productivity"
      };
    }

    return {
      audience: "business teams and professionals",
      outcome: "turn learning into practical daily execution"
    };
  }

  function setupReveal() {
    var revealItems = document.querySelectorAll(".section, .section-band, article");

    revealItems.forEach(function (item) {
      item.classList.add("reveal");
    });

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });

      revealItems.forEach(function (item) {
        observer.observe(item);
      });
    } else {
      revealItems.forEach(function (item) {
        item.classList.add("is-visible");
      });
    }
  }
}());
