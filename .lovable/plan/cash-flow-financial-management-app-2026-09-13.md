# Cash Flow & Financial Management App

A personal finance web app where each user signs in and tracks money in and out, in Rupiah.

## What gets built

**1. Sign in / register**
- Email + password register and login page at `/auth`, with clear error and success messages.
- Everything else in the app requires being signed in; visitors get sent to the sign-in page.
- Each person only ever sees their own transactions.

**2. Dashboard (the home screen after login)**
- Sidebar navigation (Dashboard, Transactions) plus a top header showing the signed-in email, a date-range filter, and logout.
- Three summary cards for the selected period: Total Pemasukan, Total Pengeluaran, Laba Bersih — all formatted as IDR (Rp 1.250.000).
- Trend chart comparing income vs expenses over time.
- Pie chart breaking spending down by category.

**3. Transactions**
- Table of transactions with title, category, date, amount, and a green (income) or red (expense) badge.
- Filters: type, category, and date range.
- "Add transaction" opens a modal form: type, amount in IDR, category, date, title, notes.
- Edit and delete on each row, with confirmation on delete and toast notifications for every save/delete.

**4. Look and feel**
- Clean slate/zinc palette with indigo accents, works on phone and desktop.

## Technical notes

- Lovable Cloud provides the database and email/password auth.
- Table `transactions`: `id`, `user_id`, `type` (income/expense), `amount` (bigint, rupiah, no cents), `category`, `occurred_on` (date), `title`, `notes`, timestamps. Row-level security scoped to `auth.uid()` plus explicit grants; indexes on `(user_id, occurred_on)`.
- Categories are a fixed enum-like list in app code (e.g. Gaji, Penjualan, Investasi / Makanan, Transportasi, Tagihan, Hiburan, Lainnya) — no separate table.
- Routes: `/auth` (public), `/_authenticated/dashboard`, `/_authenticated/transactions`; `/` redirects based on session.
- Reads and writes go through `createServerFn` with `requireSupabaseAuth`, loaded via TanStack Query; date range lives in URL search params.
- Charts use Recharts; aggregation done client-side over the fetched range.
- Toasts via sonner, mounted once in the root route.
- No demo/seed rows: the dashboard shows a friendly empty state until the first transaction is added.
