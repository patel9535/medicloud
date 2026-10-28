# Container vulnerability scan

Scanned on 2026-10-29 with Trivy 0.76.1. Reports cover OS packages and application libraries in the rebuilt Docker images, at all severities.

| Image | Result |
| --- | --- |
| `medicloud-api:local` | No vulnerabilities reported |
| `medicloud-web:local` | No vulnerabilities reported |

Full machine-readable output is in `medicloud-api-full.json` and `medicloud-web-full.json`.

The GitHub Actions workflow at `.github/workflows/container-scan.yml` rebuilds both images and fails the job if Trivy finds a HIGH or CRITICAL vulnerability. It runs on pushes to `main`, pull requests, and manual dispatch.

The fixes for this scan pin the API to Node 22.23.4 on Alpine 3.24 and remove npm/Corepack from the runtime image after dependencies are installed. The frontend uses the pinned `nginx:1.30.6-alpine3.24-slim` image. Rebuild and rescan after updating base images or dependencies.
