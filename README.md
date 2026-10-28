# MediCloud

MediCloud is a student project for booking hospital appointments. Patients request appointments and track doctor decisions in the app. Doctors manage availability and accept or reject requests. Sign-in uses IBM Cloud App ID. Use synthetic data only; do not use this project for clinical care.

## Workflow

1. A user signs in with IBM App ID.
2. Patients browse doctors and available times, then request an appointment.
3. The doctor reviews the request and accepts or rejects it.
4. The patient sees the updated status in the dashboard and appointment history.

## Tech stack

- React and Vite frontend
- Node.js and Express API
- PostgreSQL database
- IBM Cloud App ID authentication

## Run locally

Requirements: Node.js 20+ and PostgreSQL 15+. On Windows PowerShell, use `npm.cmd` if script execution prevents `npm` from running.

1. Create a PostgreSQL database. Creating a database role requires a PostgreSQL administrator.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local database connection string.
3. Copy `frontend/.env.example` to `frontend/.env` and fill in the IBM App ID values described below.
4. Install packages, migrate the schema, and start the app:

   ```powershell
   npm.cmd install
   npm.cmd run db:migrate
   npm.cmd run dev
   ```

Open <http://localhost:5173>. The API runs on <http://localhost:4000>; health and database readiness are available at `/health` and `/ready`.

## IBM Cloud App ID setup

Create an App ID application of type **Single-page application**. Add `http://localhost:5173` to the allowed redirect URLs. The SPA uses Authorization Code with PKCE and does not need a client secret in the browser. See the [IBM App ID SPA guide](https://cloud.ibm.com/docs/appid?topic=appid-single-page).

Set these values:

- `frontend/.env`: `VITE_APPID_CLIENT_ID` and `VITE_APPID_DISCOVERY_ENDPOINT` from the SPA application's credentials.
- Root `.env`: `APPID_CLIENT_ID` to the same SPA client ID and `APPID_OAUTH_SERVER_URL` to the OAuth server URL for that App ID instance.

Restart the dev servers after changing environment values. App ID must provide a verified email and a name or first-name attribute. New users are created as patients. Doctor and admin accounts must be provisioned using their verified App ID email before they sign in.

Provision a doctor from a trusted terminal after running the database migration:

```powershell
npm.cmd run user:create -w backend -- --role=DOCTOR --name="Demo Doctor" --email="doctor@example.test"
```

The command can also promote an existing patient account to doctor. It creates a demo license marker and `General Practice` specialization; update these synthetic values for your project as needed.

## Project commands

- `npm.cmd run dev` — start the API and frontend
- `npm.cmd run build` — build the frontend
- `npm.cmd run db:migrate` — apply database migrations
- `npm.cmd run user:create -w backend -- ...` — provision a doctor or admin account
- `npm.cmd test` — run backend tests

## Security

Never commit `.env` files, passwords, API keys, access tokens, or uploaded files. Keep the example environment files as placeholders. Use synthetic patient data only.
