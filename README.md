# Adepec Homes Construction Scanner

Private, invite-only scanner for extracting construction invoices and receipts, splitting allocations, uploading PDFs to Google Drive, and routing costs into project spreadsheets.

## Local development

```powershell
npm.cmd install
npm.cmd run dev
```

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

## Production secrets

Document extraction and spreadsheet sync use authenticated Vercel functions in `api/`. Configure these server-only environment variables in Vercel for Production (and Preview when needed):

- `GEMINI_API_KEY`
- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_SECRET`
- `GEMINI_MODEL` (optional; defaults to `gemini-3.1-flash-lite`)

Do not prefix these variables with `VITE_`; that would expose them in the browser bundle. The legacy Firestore document `invites/CONFIG-GEMINI` is no longer read and should be deleted after the Vercel variable is configured.
