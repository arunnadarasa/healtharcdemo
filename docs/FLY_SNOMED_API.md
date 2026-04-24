# Fly.io — SNOMED API (Option B for Lovable)

Run the **same Express API** this repo uses locally, with **`snomed-rf2.db`** (and optionally RF2 source files) on a **Fly Volume** at `/data`.

## Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and `fly auth login` (CLI tokens expire after ~30 days; run login again if `fly auth whoami` fails).
- A built **`snomed-rf2.db`** locally (`data/snomed-rf2.db` after indexing), **or** RF2 release files + `SNOMED_RF2_BASE_DIR` pointing at them on the volume (first request may build the index — slow; prefer uploading a prebuilt DB).

## 1. App and volume

```bash
fly apps create arc-snomed-api   # or another name; must match `app` in fly.toml
fly volumes create snomed_data --region ams --size 20 --app arc-snomed-api --yes
```

Use the **same region** as `primary_region` in `fly.toml` (this repo defaults to **`ams`** after LHR hit `insufficient resources` when pairing a 1–2 GB machine with a new volume). You can switch region: destroy the volume (`fly volumes destroy <id> -a arc-snomed-api -y`), set `primary_region` in `fly.toml`, recreate the volume in that region, then `fly deploy`.

Increase `--size` if your DB + RF2 exceeds 20 GB.

## 2. Put data on the volume

After first successful deploy (machine exists), upload `snomed-rf2.db`:

```bash
fly ssh console -C "mkdir -p /data"
fly sftp shell
# sftp> put /path/on/your/mac/snomed-rf2.db /data/snomed-rf2.db
```

Or from a machine with the file:

```bash
cat snomed-rf2.db | fly ssh console -C "cat > /data/snomed-rf2.db"
```

(For very large files, prefer `fly sftp` or a private download inside `fly ssh`.)

If you rely on **indexing from RF2** on Fly instead of a prebuilt DB:

- Copy the RF2 tree onto `/data/rf2` (or similar) via SFTP/rsync pattern you prefer.
- Set `SNOMED_RF2_BASE_DIR=/data/rf2` as a Fly secret or in `fly.toml` `[env]` (secrets override for sensitive paths if needed).

## 3. Secrets (minimal for SNOMED read demos)

At least set **seller** for x402 middleware (defaults exist in code, but use your wallet for real settlement):

```bash
fly secrets set X402_SELLER_ADDRESS=0xYourArcTestnetAddress
```

Optional:

- `NHS_ENABLE_PAYMENT_GATE=false` — skip USDC gate on paid POSTs (dev/demo only).
- `FEATHERLESS_API_KEY` — for `POST /api/snomed/rf2/summary`.
- `FLY_PUBLIC_CORS_ORIGINS=https://your-app.lovable.app` — comma-separated; enables CORS when the **browser** calls Fly directly (Lovable server-side proxy may not need this).

Other routes (dm+d, CDR, Circle, …) need their usual env vars if you use them; SNOMED RF2 GETs work with just the DB + defaults.

## 4. Deploy

```bash
fly deploy
```

Smoke:

```bash
curl -sS "https://arc-snomed-api.fly.dev/api/snomed/rf2/health"
curl -sS "https://arc-snomed-api.fly.dev/api/health"
```

Replace the hostname with `fly status` / your app name.

## 5. Lovable

Set **`SNOMED_API_URL`** (or your app’s equivalent) to **`https://<app>.fly.dev`**, and ensure paths match this API (`/api/snomed/rf2/...`). If the **browser** calls Fly, set **`FLY_PUBLIC_CORS_ORIGINS`** to the Lovable preview/production origin.

## Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| `insufficient resources to create new machine with existing volume` | Volume is pinned to a host that cannot fit your VM size; try **`ams`** / **`fra`**, smaller `[[vm]] memory` in `fly.toml`, or destroy and recreate the volume in another region. |
| 503 on `/api/snomed/rf2/*` | Index not ready or DB missing on `/data` |
| Machine OOM on first index | Use a prebuilt DB or raise `[[vm]] memory` in `fly.toml` |
| CORS errors from Lovable UI | Set `FLY_PUBLIC_CORS_ORIGINS` |
| Wrong edition / empty search | DB built from different RF2 package than expected |

## `fly.toml` notes

- **`[mounts]`** binds volume `snomed_data` → `/data` (must match volume name from `fly volumes create`).
- **`app`** must match your Fly app name; change `primary_region` if you are not in `lhr`.
