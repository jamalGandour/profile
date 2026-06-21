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
- `data/jamal-profile.db` - local SQLite content database only, ignored by Git
- `assets/jamal-ahmed-profile-enhanced.png` - professional profile image

## Production Data Safety

Do not keep the live SQLite database inside the GitHub deployment folder. Use a persistent folder outside the deployed project.

Recommended Hostinger structure:

```text
/home/your-hostinger-user/profile-data/jamal-profile.db
/home/your-hostinger-user/profile-data/backups/
```

Set this environment variable on the hosting server:

```bash
DB_PATH=/home/your-hostinger-user/profile-data/jamal-profile.db
```

The app will create the folder and database if they do not exist. Before changing this on production, copy the current live database to the new persistent location and keep a backup.

## Admin Backup Tools

The Admin dashboard includes a `Settings` tab with:

- System status and database path check
- Full SQLite database download
- JSON export for blog posts and training programs
- Restore content from JSON export
- Restore full SQLite database from backup
- Hostinger pre-update checklist

Use the SQLite backup before updating the Hostinger deployment from GitHub.

Restore behavior:

- JSON restore replaces blog and training content after creating a SQLite safety backup.
- SQLite restore validates the uploaded database with SQLite integrity check, creates a safety backup, then replaces the active database.
- Safety backups are stored in a `backups` folder beside the active database.

Local development still works without `DB_PATH`; it will use:

```text
data/jamal-profile.db
```

## Notes

This project uses only built-in Node.js modules, including `node:sqlite`, so it requires a modern Node.js version that supports `DatabaseSync`.
