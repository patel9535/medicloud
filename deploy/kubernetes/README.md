# Kubernetes deployment

This deploys the web and API workloads to Kubernetes. PostgreSQL is an external managed service; the cluster must provide an encrypted database endpoint, backups, and a database user restricted to this application. Documents use a persistent volume claim. The sample PVC requests `ReadWriteMany`, so select a storage class that provides encrypted RWX volumes, or adjust replicas and access mode to match your provider.

## Prepare

1. Build and push `backend/Dockerfile` as `medicloud-api:<tag>` and the root-context `frontend/Dockerfile` as `medicloud-web:<tag>`. Replace the image names in `api.yaml`, `migrate-job.yaml`, and `web.yaml` with your registry and immutable tag.
2. Edit `config.example.yaml` and `web.yaml` with your public HTTPS hostname, App ID OAuth server URL, and TLS ingress secret. Build the web image with `VITE_APPID_CLIENT_ID` and `VITE_APPID_DISCOVERY_ENDPOINT` from the App ID **single-page application** credentials. Those two values are public client configuration, not secrets.
3. Create a namespace and secrets using a local, untracked env file (never commit it):

   ```powershell
   kubectl apply -f deploy/kubernetes/namespace.yaml
   kubectl create secret generic medicloud-secrets -n medicloud --from-env-file=.env.production-secrets
   ```

   The env file must contain `DATABASE_URL` (managed PostgreSQL URL with TLS), `APPID_CLIENT_ID` (same SPA client ID), and a random `JWT_SECRET` of at least 32 bytes. Set `DATABASE_SSL=true` in the ConfigMap. Do not put secrets in ConfigMaps or source control. Use your cloud secret manager / External Secrets integration for a production cluster.

## Deploy

Apply the edited config and storage manifests, then the migration Job, workloads, ingress, and network policies:

```powershell
kubectl apply -f deploy/kubernetes/config.yaml
kubectl apply -f deploy/kubernetes/storage.yaml
kubectl apply -f deploy/kubernetes/migrate-job.yaml
kubectl wait -n medicloud --for=condition=complete job/medicloud-migrate --timeout=180s
kubectl apply -f deploy/kubernetes/api.yaml
kubectl apply -f deploy/kubernetes/web.yaml
kubectl apply -f deploy/kubernetes/network-policy.yaml
```

The example source files have `.example.yaml` suffixes so they cannot be accidentally applied as-is. Copy them to `config.yaml` and `storage.yaml`, edit them, and keep credentials out of those files. The ingress controller must use the `ingress-nginx` namespace label assumed in `network-policy.yaml`. Replace the documentation-only `203.0.113.1/32` database CIDR with the managed database's stable reachable IP/CIDR before applying the policy. Permit outbound TCP 443 from API pods to IBM App ID and DNS to cluster DNS. Check that your cluster CNI enforces Kubernetes NetworkPolicy.

## App ID and database checks

Add `https://medicloud.example.com/login` as an allowed redirect URL in the App ID single-page application, replacing the sample host with the deployed host. Keep localhost entries for development if needed. In the deployed app, verify sign-in, patient appointment creation, doctor acceptance/rejection, and the patient's refreshed status. API readiness at `/ready` checks database connectivity.

The API supports `DATABASE_SSL=true`, which requires a trusted TLS certificate. Prefer managed PostgreSQL with automated encrypted backups, private connectivity, and a least-privilege database role. Avoid exposing PostgreSQL publicly. The PVC is for protected uploaded documents only; it is not a backup. Confirm storage encryption, backup, and restore with the cluster's storage provider.
