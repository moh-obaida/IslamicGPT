# Systemd, environment, and secrets

## Production environment variables

Set these in the host environment or systemd unit file — never commit real secrets.

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | Use `production` on the VM |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password (rotate if exposed) |
| `JWT_SECRET` | Signs admin JWTs (rotate if exposed) |
| `OLLAMA_BASE_URL` | Local Ollama HTTP base URL |
| `OLLAMA_FAST_MODEL` | Fast model name |
| `OLLAMA_STRONG_MODEL` | Strong model name |
| `DEFAULT_MODEL_MODE` | Default routing mode |
| `GIT_COMMIT` | Optional override for `/api/version` commit |
| `GIT_BRANCH` | Optional override for `/api/version` branch |
| `APP_VERSION` | Optional app version string (default `0.2.0`) |

## Version metadata

`/api/version` reads Git when available, then `GIT_COMMIT` / `GIT_BRANCH` env overrides, then falls back to `unknown` without crashing.

## Secret handling

Do **not** expose secrets in:

- Application logs
- `/api/version` or `/health` responses
- Frontend bundles or screenshots
- Debug API payloads

If `ADMIN_PASSWORD` or `JWT_SECRET` is exposed, **rotate immediately** and restart the backend.

## Importer performance notes

Quran/Tafsir importers still normalize datasets before `--only` filtering. Early filtering inside normalization is a future optimization; do not change normalization semantics without tests.
