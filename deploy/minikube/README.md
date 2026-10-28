# Local Kubernetes deployment with Minikube

This profile runs a single-replica frontend, API, and PostgreSQL database in Minikube. It is suitable for a local class demonstration, not production: Minikube storage is local to the cluster and this setup does not provide managed backups or public TLS.

Use the deployment steps from the project workspace. The frontend is exposed through NodePort 30080. App ID must allow the local callback origin `http://localhost:8080`.
