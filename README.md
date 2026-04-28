# 百家樂戰績記錄 · Baccarat Tracker

**Website:** https://ping-hsun-chiang.github.io/baccarat-tracker/

---

## Project Overview

A lightweight, mobile-friendly static web app for tracking daily Baccarat win/loss results. All data is stored locally in the browser using an embedded SQLite database (via WebAssembly), so no account, no server, and no internet connection is required after the initial load.

---

## Main Features

- **Win / Loss Entry** — Two dedicated input blocks for recording wins and losses separately, with a shared date and optional note field
- **Summary Cards** — Displays total net profit/loss, current month, and current year at a glance; card values auto-scale in font size to fit any screen
- **Profit Trend Chart** — Line chart showing cumulative daily profit/loss; navigate month by month or view all-time data
- **Daily Summary Table** — Aggregated win, loss, and net profit per day
- **Detail Records Table** — Full list of individual entries with delete support
- **SQL Query Log** — A live panel showing every SQL statement executed, great for learning SQLite
- **SQLite Storage** — Data persisted as a serialized SQLite binary in localStorage; survives page refreshes without any backend
- **Responsive Design** — Works on both desktop and mobile; summary cards stay in a 3-column row on all screen sizes
- **Taiwan Local Time** — All dates default to the browser's local time, not UTC

---

## Technologies Used

| Layer | Technology |
|-------|------------|
| Structure | HTML5 |
| Styling | CSS3 (CSS Variables, Grid, Flexbox, `clamp()`) |
| Logic | Vanilla JavaScript (ES2020) |
| Database | [sql.js](https://sql-js.github.io/sql.js/) — SQLite compiled to WebAssembly |
| Chart | [Chart.js](https://www.chartjs.org/) |
| Font | [Inter](https://fonts.google.com/specimen/Inter) · [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (Google Fonts) |
| Hosting | GitHub Pages |

---

## Author
**Ping-Hsun Chiang**  
GitHub: [Ping-Hsun-Chiang](https://github.com/Ping-Hsun-Chiang)
