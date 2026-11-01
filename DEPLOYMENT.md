# SRLMS / RailCare AI Assistant — Free Cloud Deployment Guide

This guide takes you from the GitHub repo to a **live, publicly accessible app at zero cost**:

| Part | What it is | Free host used here |
|---|---|---|
| Database | MongoDB (data + call recordings in GridFS) | **MongoDB Atlas M0** |
| Backend | Node/Express REST API + Socket.IO (WebRTC signaling) | **Render** (free web service) |
| Frontend | React + Vite static site | **Vercel** (or Netlify / Cloudflare Pages) |
| Keep-alive | Pings the backend so it doesn't sleep | **UptimeRobot** (free) |
| AI intent service | Python FastAPI + FastEmbed/ONNX multilingual classifier | **Render** (free web service; optional for API, but enables semantic embeddings) |

```
 Browser ──HTTPS──> Vercel (static React build)
    │
    ├──HTTPS REST──> Render: Node API ──> MongoDB Atlas (M0)
    │                       └──HTTPS + shared token──> Render: Python AI classifier
    └──WSS (Socket.IO / WebRTC signaling)──┘
 Browser <──WebRTC audio (peer-to-peer, STUN/optional TURN)──> Browser
 Twilio / Razorpay / Gmail  ──(optional)──> Render API
```

> Free-tier limits and UI labels change over time. Where a number matters I note it; always confirm on the provider's pricing page.

---

## 0. What was changed to make the project deployment-ready

| Area | Change |
|---|---|
| **Secrets** | JWT secret handling centralised in `server/src/utils/config.js`. With `NODE_ENV=production` the server **refuses to start** if `JWT_SECRET` is missing/short/default, `MONGO_URI` is missing, or `JWT_EXPIRES_IN=none`. |
| **DB logging** | `db.js` no longer prints the full Mongo URI (it contained the DB password) to the logs. |
| **CORS** | New `CORS_ORIGINS` env var restricts the REST API **and** Socket.IO to your frontend (was `*`). |
| **Reverse proxy** | `trust proxy` enabled so rate limiting works per real client IP behind Render. |
| **Health check** | `GET /health` returns 200 / 503 depending on MongoDB state; placed before the rate limiter. |
| **Graceful shutdown** | SIGTERM/SIGINT closes sockets and the DB cleanly on redeploys. |
| **Seed script** | Refuses to wipe a non-local/production DB unless `ALLOW_SEED=true`, and requires `SEED_PASSWORD` (no public `password123` on the internet). |
| **Frontend URL** | `client/src/config.js` no longer appends `:4000` to the hostname in production builds; set `VITE_BACKEND_URL`. |
| **Voice calls** | `client/src/iceConfig.js` — optional TURN relay via env vars (calls on mobile data often fail with STUN only). |
| **Docker** | Server image uses `npm ci`, runs as non-root, has a healthcheck. Client image is a multi-stage build served by nginx with build args. `docker-compose.yml` now includes a local MongoDB. |
| **Hosting configs** | `render.yaml` (Render Blueprint), `client/vercel.json`, `netlify.toml`, `client/public/_redirects`. |
| **CI** | `.github/workflows/ci.yml` syntax-checks the server and builds the client on every push. |
| **Privacy** | A personal phone number was hard-coded in a UI toast and comments — removed. |
| **Repo hygiene** | `.gitattributes` (line-ending normalisation), stricter `.gitignore`, `.dockerignore` files. |

---

## 1. Prerequisites

- A **GitHub** account and this repository: `https://github.com/Murtazahd04/Railcare-Ai-Assistant-.git`
- Free accounts on: **MongoDB Atlas**, **Render**, **Vercel**, **UptimeRobot**
- Locally: Git and Node.js 20+ (only needed to push code and to run the seed script once)

---

## 2. Step 1 — Push the deployment-ready code to GitHub

From the folder containing the updated project:

```bash
git status                       # review the changes
git add .
git status                       # CONFIRM server/.env and README.private.md are NOT listed
git commit -m "Make project deployment-ready (prod config, CORS, health, Render/Vercel configs, docs)"
git push origin main
```

**Critical check:** `server/.env` and `README.private.md` contain real credentials and are in `.gitignore`. If `git status` ever lists them, run `git rm --cached server/.env README.private.md` before committing.

Confirm in the GitHub web UI that no `.env` file is visible in the repo.

### Rotate your secrets (strongly recommended)
Your local `server/.env` held live Twilio, Razorpay, Gmail and database credentials. If that folder was ever zipped, shared, uploaded or screen-shared, treat the values as exposed and regenerate them:

- **Twilio**: Console → Account → *Auth Tokens* → rotate the Auth Token
- **Razorpay**: Dashboard (Test Mode) → Settings → API Keys → regenerate
- **Gmail App Password**: <https://myaccount.google.com/apppasswords> → revoke and create a new one
- **MongoDB**: you will create a fresh Atlas user in Step 2 anyway
- **JWT_SECRET**: you will generate a new one below

---

## 3. Step 2 — MongoDB Atlas (free database)

1. Sign up at <https://www.mongodb.com/cloud/atlas>.
2. **Create a deployment → M0 (Free)**. Pick a region near your users (e.g. **AWS Mumbai `ap-south-1`** or Singapore). Name it `srlms-cluster`.
3. **Database user**: *Security → Database Access → Add New Database User* — username `srlms_app`, password authentication. Use a **long alphanumeric password** (special characters must be URL-encoded in the connection string — avoid them). Role: *Read and write to any database*. Save the password.
4. **Network access**: *Security → Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`)*.
   Render's free tier has no static outbound IP, so IP allow-listing is not possible. Your protection is the strong DB password + TLS.
5. **Connection string**: *Database → Connect → Drivers* → copy the `mongodb+srv://...` URI and **add the database name** `srlms` before the `?`:

   ```
   mongodb+srv://srlms_app:<PASSWORD>@srlms-cluster.xxxxx.mongodb.net/srlms?retryWrites=true&w=majority
   ```
   Keep it handy — it is your `MONGO_URI`.

> M0 gives 512 MB of storage. Call recordings (WebM, stored in GridFS) count towards this; heavy recording usage will fill it.

---

## 4. Step 3 — Seed the database (one time)

The app needs trains, passengers, knowledge-base intents and staff accounts. The seed script creates them. **It deletes existing data in those collections**, so on a remote DB it requires explicit opt-in.

Generate secrets first (you'll reuse the JWT one on Render):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Windows PowerShell**
```powershell
cd server
npm ci
$env:MONGO_URI="mongodb+srv://srlms_app:<PASSWORD>@srlms-cluster.xxxxx.mongodb.net/srlms?retryWrites=true&w=majority"
$env:ALLOW_SEED="true"
$env:SEED_PASSWORD="ChooseAStrongDemoPassword1"
npm run seed
```

**macOS / Linux**
```bash
cd server && npm ci
MONGO_URI='mongodb+srv://...' ALLOW_SEED=true SEED_PASSWORD='ChooseAStrongDemoPassword1' npm run seed
```

Environment variables set in the shell take priority over your local `server/.env`, so the seed goes to Atlas. When it finishes you can log in as `admin`, `supervisor`, `priya`, `karan`, `farah`, `vikas`, `sneha` with `SEED_PASSWORD`. Close the terminal afterwards so the variables disappear.

Verify: Atlas → *Database → Browse Collections* → `srlms` should contain `users`, `trains`, `passengers`, `kbintents`, etc.

---

## 5. Step 4 — Deploy the backend on Render

### Option A: Blueprint (fastest)
1. <https://dashboard.render.com> → **New → Blueprint** → connect GitHub → select the repo.
2. Render reads `render.yaml` and proposes a free web service `srlms-api` (region Singapore, root dir `server`).
3. Fill the prompted values (see the table below), then **Apply**.

### Option B: Manual
1. **New → Web Service** → select the repo.
2. Settings:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm ci --omit=dev`
   - **Start Command:** `npm start`
   - **Instance type:** Free
   - **Health Check Path:** `/health`
3. Add environment variables under *Environment*.

### Environment variables for Render

| Variable | Value | Required |
|---|---|---|
| `NODE_ENV` | `production` | ✅ |
| `MONGO_URI` | Atlas string from Step 2 | ✅ |
| `JWT_SECRET` | 64-hex-char random string (Blueprint auto-generates) | ✅ |
| `JWT_EXPIRES_IN` | `8h` | ✅ (`none` is rejected) |
| `CORS_ORIGINS` | Your Vercel URL, e.g. `https://srlms.vercel.app` (set after Step 5; no trailing slash; comma-separate multiple) | ✅ |
| `TRUST_PROXY` | `1` | ✅ |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **test** keys | optional |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio credentials | optional |
| `TWILIO_PHONE_NUMBER` | Your Twilio number, E.164 | optional |
| `TWILIO_EXECUTIVE_FALLBACK_NUMBER` | Verified phone to bridge calls to | optional |
| `TWILIO_WHATSAPP_FROM` / `TWILIO_WHATSAPP_JOIN_CODE` | Sandbox number / join phrase | optional |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `EMAIL_FROM_NAME` / `SOS_ALERT_EMAIL` | Resend API; `onboarding@resend.dev` for testing, verified domain required for passenger email | optional |
| `AI_SERVICE_URL` | Public `https://<AI-service-name>.onrender.com` URL from Render | Optional; enables Python embeddings |
| `AI_SERVICE_TOKEN` | Shared generated secret on both Render services | Required when AI service is deployed |
| `AI_CLASSIFY_TIMEOUT_MS` | `8000` | Optional; bounded from 1000–30000 ms |

Do **not** set `PORT` — Render injects it.

Leave optional integrations blank to disable them; the code no-ops gracefully.

### Verify
After the first deploy (a few minutes), open your Render URL, e.g. `https://srlms-api.onrender.com`:

- `/` → `{"service":"srlms-server","status":"running"}`
- `/health` → `{"ok":true,"db":"up",...}`

If `/health` shows `"db":"down"` or the deploy fails, open **Logs** (see Troubleshooting).

Copy the service URL — it is your **backend URL**.

---

## 6. Step 5 — Deploy the frontend on Vercel

1. <https://vercel.com> → **Add New → Project** → import the GitHub repo.
2. Configure:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite (auto-detected; `client/vercel.json` also sets it)
   - **Build Command:** `npm run build` · **Output Directory:** `dist`
3. **Environment Variables** (must be present *before* building):
   - `VITE_BACKEND_URL` = `https://srlms-api.onrender.com` (your Render URL, **no trailing slash, no `/api/v1`**)
4. **Deploy.** You get a URL such as `https://srlms.vercel.app`.

> Vite variables are baked in at build time. If you change `VITE_*` later, **redeploy** the project.

The app uses hash routes (`/#/passenger`, `/#/supervisor`, …), so no special rewrite rules are needed — `vercel.json`, `_redirects` and `netlify.toml` include fallbacks anyway.

### Alternatives for the frontend
- **Netlify:** New site from Git → it picks up the root `netlify.toml` (base `client`). Add `VITE_BACKEND_URL` under *Site configuration → Environment variables*.
- **Cloudflare Pages:** Root directory `client`, build `npm run build`, output `dist`, add `VITE_BACKEND_URL`, and set `NODE_VERSION=20`.

---

## 7. Step 6 — Connect frontend ↔ backend (CORS)

1. Render → `srlms-api` → **Environment** → set `CORS_ORIGINS` = your Vercel URL (e.g. `https://srlms.vercel.app`). Include every URL users will visit (add custom domains too, comma-separated).
2. Save — Render redeploys automatically.
3. Open the Vercel URL, go to the login page, and sign in as `admin` with your `SEED_PASSWORD`.

Vercel preview deployments get different URLs; add them to `CORS_ORIGINS` only if you need to test previews.

---

## 8. Step 7 — Keep the backend awake (UptimeRobot)

Render's free web service **spins down after 15 minutes without inbound traffic** and takes roughly a minute to start again. For a live-calling app that matters: the in-memory call queue and online-executive list reset when the process restarts.

1. <https://uptimerobot.com> → **Add New Monitor** → *HTTP(s)*.
2. URL: `https://srlms-api.onrender.com/health`, interval **5 minutes**.

Trade-off: Render grants **750 free instance hours per month**; one service running 24/7 uses ~744 of them. Therefore deploy **only one** free web service in that Render workspace. If you only need the app during demos/viva, skip the monitor and "wake" the API by opening `/health` a minute before you start.

---

## 9. Step 8 — Optional integrations

### 9.1 Razorpay (test mode)
Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test keys, `rzp_test_...`) on Render. Redeploy. Test with Razorpay's test cards.

### 9.2 Twilio (phone helpline + WhatsApp)
Twilio must reach your server over public HTTPS — your Render URL provides that.

- **Voice:** Console → Phone Numbers → your number → *A call comes in* → Webhook, **HTTP POST**:
  `https://srlms-api.onrender.com/api/v1/telephony/voice/incoming`
- **WhatsApp sandbox:** Console → Messaging → Try it out → WhatsApp Sandbox Settings → *When a message comes in* → **POST**:
  `https://srlms-api.onrender.com/api/v1/telephony/whatsapp/incoming`

Trial accounts can only call/message **verified** numbers. Note that a sleeping free Render instance may miss Twilio's webhook timeout — another reason to use the keep-alive monitor.

### 9.3 Email notifications (Resend)
Create a Resend API key and set `RESEND_API_KEY` on Render. For testing without a domain, use `RESEND_FROM_EMAIL=onboarding@resend.dev` and send only to an address allowed by Resend's test mode. To email passengers, verify a domain in Resend and set `RESEND_FROM_EMAIL` to an address on that domain. Set `SOS_ALERT_EMAIL` separately if emergency email alerts are needed.

### 9.4 TURN relay (strongly recommended for real voice-call testing)
WebRTC audio is peer-to-peer. Over STUN only, calls between devices on mobile data or strict Wi-Fi may connect with **no audio**. A free TURN relay fixes this:

1. Create a free account at a TURN provider (e.g. Metered's Open Relay / free tier) and copy the TURN URL(s), username and credential.
2. In Vercel add:
   - `VITE_TURN_URL` = `turn:<host>:80,turns:<host>:443?transport=tcp` (comma-separated)
   - `VITE_TURN_USERNAME` = `<username>`
   - `VITE_TURN_CREDENTIAL` = `<credential>`
3. Redeploy the frontend.

These values ship to every browser (that is inherent to WebRTC TURN). Use the provider's limited free credentials, never anything privileged.

### 9.5 AI intent service (Python on Render Free)
The Blueprint now defines a separate `srlms-ai-classifier` Python web service. After the multilingual MiniLM model exceeded Render Free's 512 MB memory limit, the service was switched to FastEmbed/ONNX Runtime with the smaller, English-focused `sentence-transformers/all-MiniLM-L6-v2` model (about 0.09 GB in FastEmbed's supported-model catalog). It excludes PyTorch, Whisper and Piper. The model is downloaded during the Render build; the free service uses CPU inference and can spin down after inactivity. Phrase embeddings are computed in small batches to limit peak memory.

1. Deploy or sync the Blueprint. The Node API and Python classifier must be in the same Render region (the Blueprint sets both to Singapore).
2. In Render, open the Python service and copy its public `onrender.com` URL into the Node service's `AI_SERVICE_URL` environment variable.
3. The Blueprint shares `AI_SERVICE_TOKEN` between both services through the `srlms-ai-auth` environment-variable group. Do not expose this value in the frontend or logs.
4. Wait for the Python service to finish its initial build and become healthy. `GET <AI_SERVICE_URL>/health` returns the model name and whether it has been loaded in memory. The first classification after a service restart may need to load the model.
5. Test `POST <AI_SERVICE_URL>/classify` from the backend using the shared bearer token and a small sample payload; do not call the protected classifier directly from the browser.

Render Free services can sleep after 15 minutes without inbound traffic and take about a minute to wake. The Node classifier waits up to 8 seconds by default; if the Python service is still waking, the current query uses the Node lexical fallback and subsequent queries can use embeddings once the Python service is ready. This is a free-tier tradeoff, not a guaranteed always-on real-time inference service. Speech-to-text and text-to-speech dependencies are only available through `ai-service/requirements-local.txt`; browser speech APIs remain the production fallback.

The compact Python model is English-focused and does not provide dependable Hindi/Hinglish semantic matching. In Auto mode, Devanagari and common Hinglish markers are routed to Node's lexical classifier; other queries try Python then fall back to Node if unavailable. This language detection is heuristic, so add Hindi-script and Hinglish questions/synonyms to the knowledge base and verify with the Admin classifier selector. Run labeled tests before relying on either classifier for a language. Cosine similarity values are not accuracy percentages.

---

## 10. Step 9 — Post-deploy smoke test

Run through this with the live URLs:

- [ ] Frontend loads over `https://`, no red CORS errors in DevTools → Console
- [ ] Staff login works (`admin`, `supervisor`, `priya`)
- [ ] Passenger Portal (`/#/passenger`) sign-up or login works; raising a complaint works
- [ ] Analytics (`/#/analytics`) and Admin Training (`/#/admin`) load data
- [ ] **Call test:** open `/#/` as executive `priya` in one browser, `/#/customer` in another (different device/network ideal). Start a call; allow the microphone (needs HTTPS — satisfied). Confirm two-way audio. If there's none, set up TURN (§9.4)
- [ ] Supervisor (`/#/supervisor`) sees the live roster
- [ ] `GET <backend>/health` returns `"db":"up"`

---

## 11. Updating the app later

Push to `main`:
```bash
git add . && git commit -m "your change" && git push
```
Render and Vercel both **auto-deploy** on push. GitHub Actions (`ci.yml`) runs a syntax check and a client build on every push/PR. To roll back, use *Deploys → Rollback* on Render or *Deployments → Promote* on Vercel.

If you rotate `JWT_SECRET`, all logged-in users are signed out (expected).

---

## 12. Free-tier limitations (read before a demo)

| Limitation | Effect | Mitigation |
|---|---|---|
| Render free sleeps after 15 min idle, ~1 min cold start | First request/WebSocket after idle is slow | UptimeRobot ping (§8) or pre-warm before demos |
| Render may restart a free service at any time | Active calls drop; in-memory queue/roster resets | Acceptable for demos; paid instance or a redesign (Redis state) for real production |
| Render 750 instance-hours/month | Only one always-on free service fits | Don't add other free web services in the same workspace |
| 512 MB RAM on free instance | Large uploads/recordings are buffered in memory (25 MB cap each) | Keep recordings short |
| Atlas M0 = 512 MB storage | Recordings fill it | Delete old recordings; use shorter calls |
| Twilio trial | Only verified numbers; "trial" prefix on calls | Upgrade Twilio for real users |
| Razorpay | Test mode only | Complete KYC for live keys |
| Vercel Hobby | Intended for non-commercial use | Use Netlify/Cloudflare Pages or a paid plan for commercial use |
| No AI microservice | Intent matching uses the lexical fallback; STT/TTS uses the browser | Optional host in §9.5 |

---

## 13. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Render deploy crashes: `Unsafe production configuration` | Env var missing/weak. Ensure `MONGO_URI`, a 32+ char `JWT_SECRET`, and `JWT_EXPIRES_IN=8h` (not `none`). |
| Logs: `MongoServerSelectionError` | Atlas Network Access lacks `0.0.0.0/0`, or wrong password / un-encoded special characters in the URI. |
| Logs: `bad auth` | DB username/password wrong, or the user lacks permissions. |
| Browser console: **CORS error** | `CORS_ORIGINS` doesn't exactly match your frontend origin (`https://…`, no trailing slash, correct subdomain). Fix and let Render redeploy. |
| Login page says "Could not reach the server" | `VITE_BACKEND_URL` missing/wrong at build time → set it in Vercel and **redeploy**. Or the Render service is still waking up. |
| Requests go to `https://<your-vercel-domain>/api/...` | `VITE_BACKEND_URL` wasn't set during the build (the app then assumes same-origin). |
| Everything is slow for ~60 s, then fine | Render cold start. Use the keep-alive monitor. |
| Call connects but no audio | NAT/firewall — configure TURN (§9.4). Also check browser mic permission. |
| Socket.IO keeps reconnecting | Backend asleep/restarting, or origin not in `CORS_ORIGINS`. |
| `Too many requests` for everyone at once | `TRUST_PROXY` not `1` (all users share one IP). |
| Seed: `Refusing to run…` | Intended safeguard — set `ALLOW_SEED=true` and `SEED_PASSWORD` (8+ chars). |
| Everyone logged out after a deploy | `JWT_SECRET` changed (e.g. regenerated). Normal. |
| Twilio webhook 5xx/timeouts | Instance was asleep; add monitoring, check logs. |

View logs: Render → service → **Logs**; Vercel → project → **Deployments → Logs**; browser DevTools → Console/Network.

---

## 14. Security checklist before sharing the URL

- [ ] `.env` and `README.private.md` are **not** in GitHub (check history too: `git log --all -- server/.env` should print nothing)
- [ ] All secrets that ever sat in a local `.env` were rotated (§2)
- [ ] `NODE_ENV=production`, `JWT_EXPIRES_IN=8h`, strong `JWT_SECRET`
- [ ] `CORS_ORIGINS` set to your real frontend URL only
- [ ] Seeded with a strong `SEED_PASSWORD` (not `password123`); `ALLOW_SEED`/`SEED_PASSWORD` removed from any hosted env afterwards
- [ ] Atlas DB user has a strong password
- [ ] Razorpay is on **test** keys unless you've completed KYC
- [ ] Known gap: Twilio webhook endpoints don't validate Twilio's request signature. Acceptable for a demo; add `twilio.validateRequest` before real production use

---

## 15. Run it with Docker instead (local / VPS)

```bash
cp server/.env.example server/.env       # fill in JWT_SECRET etc. (MONGO_URI is overridden to the bundled mongo)
docker compose up --build                # mongo + server + client
# optional heavy AI service:
docker compose --profile ai up --build
```
- Frontend: <http://localhost:5173> · API: <http://localhost:4000/health>
- Seed the compose database: `docker compose exec server npm run seed` (the Mongo host is local, so no extra flags are needed — but note `NODE_ENV=production` is set in the server image, so also pass `-e ALLOW_SEED=true -e SEED_PASSWORD=...`):
  ```bash
  docker compose exec -e ALLOW_SEED=true -e SEED_PASSWORD=ChooseAStrongDemoPassword1 server npm run seed
  ```
- For a different public URL, rebuild the client with `--build-arg VITE_BACKEND_URL=https://api.yourdomain.com`.

---

## 16. Quick reference — every environment variable

**Backend (Render)** — see `server/.env.example` for comments

`NODE_ENV`, `PORT` (auto), `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `TRUST_PROXY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `AI_SERVICE_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_EXECUTIVE_FALLBACK_NUMBER`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_JOIN_CODE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_FROM_NAME`, `SOS_ALERT_EMAIL`; seed-only: `ALLOW_SEED`, `SEED_PASSWORD`

**Frontend (Vercel, build-time)** — see `client/.env.example`

`VITE_BACKEND_URL`, `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`
