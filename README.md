# Jamal Ahmed Profile Platform

Professional bilingual profile website for Jamal Ahmed with a Node.js backend, SQLite database, blog management, training management, embedded training videos, quizzes, and a mobile-friendly admin dashboard.

## Features

- English-first and Arabic-second professional website
- Cairo Google Font
- Blue, yellow, black, gold, and white visual identity
- Dark mode toggle
- Blog section with hero images
- Training section with video links, course sections, and quizzes
- Embedded YouTube and Vimeo video player inside training content
- Admin dashboard for creating, reading, updating, and deleting blogs and training programs
- SQLite local database
- Fully mobile-friendly layout

## Run Locally

```bash
node server.js
```

Then open:

```text
http://localhost:3300/
```

Admin dashboard:

```text
http://localhost:3300/admin.html
```

Default local admin password:

```text
Jamal@3300
```

For deployment, set a secure environment variable:

```bash
ADMIN_PASSWORD=your-secure-password
```

## Project Files

- `server.js` - Node.js server and SQLite API
- `index.html` - public website
- `admin.html` - admin dashboard
- `script.js` - public website interactions
- `admin.js` - admin dashboard interactions
- `styles.css` - responsive design and dark mode
- `data/jamal-profile.db` - SQLite content database
- `assets/jamal-ahmed-profile-enhanced.png` - professional profile image

## Notes

This project uses only built-in Node.js modules, including `node:sqlite`, so it requires a modern Node.js version that supports `DatabaseSync`.
