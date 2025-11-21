
# Attendance-PWA

Simple attendance/calendar system (PWA) using Node.js + Express + SQLite.
- Sign up / Login (ID number)
- Roles: developer (default) and staff (admin)
- Calendar (FullCalendar)
- PWA manifest + service worker
- SQLite DB file auto-created on first run

## Quick start (local)

1. Install Node.js (>=16)
2. Unzip the project and in the project root run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:4000/login.html

## Notes

- A default SQLite DB file `data/attendance.db` will be created automatically.
- To create an initial staff user manually, use the `curl` example below after server runs:
  ```
  curl -X POST http://localhost:4000/api/auth/signup -H "Content-Type: application/json" -d '{"id_number":"000000000","full_name":"Admin User"}'
  ```
  Then set role via the admin page when logged in as staff (or modify DB).
