# Project Architecture Rules

- Keep cross-table stock mutations atomic in PostgreSQL RPCs because the app has no custom backend server.
- Treat colored-material minimum stock as a per-color threshold; never aggregate it into a material-level minimum.
- Use global semantic status tokens for payroll feedback and shared Button controls; keep payroll calculations and payment handlers independent of presentation changes.