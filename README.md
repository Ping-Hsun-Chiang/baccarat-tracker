# 百家樂戰績記錄 · Baccarat Tracker

**Website:** https://ping-hsun-chiang.github.io/baccarat-tracker/

---

## Project Overview

A mobile-friendly web app for tracking daily Baccarat win/loss results. Supports multi-user accounts with cross-device access — users register with their name, phone number, and password, and can log in from any device to retrieve their personal records. All data is stored in a cloud PostgreSQL database (Supabase), with Row Level Security ensuring each user can only access their own data.

---

## Main Features

- **User Authentication** — Register and log in with phone number and password; each account has fully isolated data storage
- **Cross-device Sync** — Records are stored in the cloud and accessible from any device after login
- **Win / Loss Entry** — Two dedicated input blocks for recording wins and losses separately, with a shared date and optional note field
- **Summary Cards** — Displays total net profit/loss, current month, and current year at a glance; font size auto-scales to fit any screen width
- **Profit Trend Chart** — Line chart showing cumulative daily profit/loss; navigate month by month or view all-time data
- **Daily Summary Table** — Aggregated win, loss, and net profit per day
- **Detail Records Table** — Full list of individual entries with per-row delete support
- **Responsive Design** — Works on both desktop and mobile; summary cards stay in a 3-column row on all screen sizes
- **Taiwan Local Time** — All dates default to the browser's local time, not UTC

---

## Technologies Used

| Layer | Technology |
|-------|------------|
| Structure | HTML5 |
| Styling | CSS3 (CSS Variables, Grid, Flexbox, `clamp()`) |
| Logic | Vanilla JavaScript (ES2020) |
| Auth & Database | [Supabase](https://supabase.com/) — PostgreSQL with Row Level Security |
| Chart | [Chart.js](https://www.chartjs.org/) |
| Font | [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts) |
| Hosting | GitHub Pages |

---

## Author

**Ping-Hsun Chiang**  
GitHub: [Ping-Hsun-Chiang](https://github.com/Ping-Hsun-Chiang)
