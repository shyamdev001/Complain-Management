# The Solar Coop — Complaint / Service Management

Replaces the paper complaint register. **Only the office uses the app.** The
office logs each complaint and manually picks the installer (AP Enterprise or
Navia). Installers have no login: each day the office downloads an Excel sheet
of that installer's complaints and sends it to them, then records in the app
what the installer reports back.

```
Customer calls → Office creates complaint → Office selects installer
  → Office downloads the installer's Excel sheet and sends it
  → Installer reports back → Office records: accepted, visit, work done
  → "Resolved by Installer" → customer confirms → Closed
                                      ↘ not solved → Reopened
```

Same stack and design system as the Solar Coop lead app: React 18 + Vite +
Tailwind (client), Express + TypeScript + Mongoose (server), MongoDB, JWT in
httpOnly cookies.

## Run it

```bash
npm run install:all
npm run seed          # optional: the server also creates AP Enterprise, Navia and the first login on start
npm run dev:server    # http://localhost:5050
npm run dev:client    # http://localhost:5174
```

`server/.env` holds the configuration (copy `server/.env.example` for a new
machine). The first office login is the `SEED_ADMIN_*` values in that file;
change the password after first login (Installers & Users → Set password). The
seed creates no customers and no complaints.

Tests: `npm test` (20 API tests against an in-memory MongoDB — workflow, Excel
export and import, access, reopen, overdue/SLA, photos, webhook).

## Hosting (Render + MongoDB Atlas, free)

In production one service runs everything: the server also serves the built
screens, so there is a single address and login cookies stay on one site.
`render.yaml` describes it.

1. **MongoDB Atlas** — create a free cluster, add a database user, allow
   access from anywhere (`0.0.0.0/0`, Render's free addresses change), and
   copy the connection string. Put the database name in it:
   `mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/solar-coop-complaints`
2. **Render** — New → Blueprint → pick this repository. Render reads
   `render.yaml` and asks for three values:
   - `MONGODB_URI` — the Atlas string from step 1
   - `SEED_ADMIN_EMAIL` — the email the office will sign in with
   - `SEED_ADMIN_PASSWORD` — the first password (8+ characters)
3. Wait for the first deploy, open the `…onrender.com` address and sign in.

On first start the server creates AP Enterprise, Navia and that first office
login. Later pushes to `main` redeploy automatically.

Free-plan limits: the service sleeps after about 15 minutes without use (the
next visit takes up to a minute to wake it), and its disk is not kept, so set
the three `CLOUDINARY_*` variables before relying on service photos.

## The Excel sheet

**Download Excel** (dashboard and Complaints page) → choose the installer →
the dates default to today → Download. The file is named
`AP-Enterprise_Complaints_2026-10-06.xlsx`.

- One row per complaint: complaint number, date, priority, customer name,
  mobile, address, village/city, project ID, system size, installation date,
  category, description, status, due date.
- Five empty columns for the installer to fill in: visit date, problem found,
  work done, parts used, remarks.
- Each sheet contains only that installer's complaints. Archived complaints
  are left out.
- "Also include older pending complaints" adds everything of that installer
  that is still open, so nothing older is forgotten.
- Each download is recorded on the complaint's timeline and in the audit log.

## Importing the filled-in sheet

**Import Filled Sheet** (next to Download Excel) → choose the `.xlsx` the
installer sent back → check the preview → **Apply**. Nothing is saved until
Apply is pressed.

What each row does:

| Installer filled in | Result |
|---|---|
| Nothing | No change |
| Anything at all | Complaint is marked Accepted (if it was New or Reopened) |
| Visit Date | Visit is scheduled → Visit Scheduled |
| Problem Found or Work Done only | Details saved → In Progress |
| Problem Found **and** Work Done | Marked Resolved by Installer, ready for the office to confirm and close |
| Parts Used, Remarks | Saved on the service report |

- Visit dates are read day-first (`07/10/2026 9:30 am`, `7-10-26`, `07 Oct 2026`);
  a date with no time is taken as 10:00 am. A date that cannot be read is
  flagged and left for the office to enter by hand.
- Parts are split on commas or new lines; `MC4 connector x 2` gives quantity 2.
- Rows are skipped, with the reason shown, when the complaint is closed,
  already resolved, archived, not found, listed twice, or has since been
  reassigned to another installer.
- Columns are matched by their header text, so keep the header row and the
  Complaint No column as they are. Uploading the same file twice changes
  nothing the second time.
- Photos cannot come through the sheet; attach them on the complaint page.

The office can still enter everything by hand on the complaint page (Mark
Accepted, Schedule Visit, Start Work, Waiting for Parts, service report, Mark
as Resolved).

## How it works

- **Access** — every route requires an office login. Installer accounts cannot
  sign in.
- **Complaint number** — `SC-CMP-000001`, from an atomic counter; never repeats.
- **Installer selection** — required. It is pre-selected from the customer's
  "installed by" field when that matches an installer in the list; the office
  can change it, and must choose when nothing matches.
- **Customers** — one customer record (`SC-CUS-000001`); complaints reference
  it and keep a small snapshot so old tickets stay readable. A new customer
  can be added inline while creating the complaint.
- **Duplicate warning** — selecting a customer who already has an open
  complaint shows it; the office can still create another.
- **Statuses** — New → Accepted → Visit Scheduled → In Progress → Waiting for
  Parts → Resolved by Installer → Closed, plus Reopened.
- **Reopen** — earlier resolutions are kept in `resolutions[]`; nothing is
  overwritten.
- **Reassign** — moves the complaint to the other installer as New and records
  "Previously assigned to X. Reassigned to Y by Z". It then appears on the new
  installer's sheet.
- **Timeline** — append-only activity history on every complaint; a separate
  audit log records who did what across the system.
- **Overdue** — response and resolution targets per priority, editable under
  SLA Settings. Overdue complaints are flagged in lists and on the dashboard,
  with a bell notification (a sweep runs every 5 minutes).
- **Archive** — soft delete. There is no hard-delete route.
- **Photos** — optional; if the installer sends photos the office can attach
  them. Stored privately in the server's `uploads/` folder, or in Cloudinary
  when the three `CLOUDINARY_*` values are set.

## WhatsApp (n8n) — optional, not connected

Set `N8N_WEBHOOK_URL` and every complaint event is POSTed there as JSON, so an
n8n workflow can send WhatsApp messages. For the customer's "Issue Resolved /
Issue Still Exists" reply, n8n calls back:

```
POST {SERVER_URL}/api/webhooks/customer-confirmation
x-webhook-secret: <WEBHOOK_SECRET>
{ "complaintNumber": "SC-CMP-000125", "response": "RESOLVED" | "NOT_RESOLVED" }
```

The endpoint is disabled until `WEBHOOK_SECRET` is set. Until then the office
records the customer's answer with the two buttons on the complaint page.

## Not in V1

Installer logins, automatic
installer detection, a customer portal, and bulk customer import.
