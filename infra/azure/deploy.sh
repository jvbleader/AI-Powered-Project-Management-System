#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-}"

if [[ -n "${ENV_FILE}" ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Env file not found: ${ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required variable: ${name}" >&2
    exit 1
  fi
}

resource_exists() {
  "$@" >/dev/null 2>&1
}

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

is_truthy() {
  case "$(to_lower "${1:-false}")" in
    1|true|yes|y|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

wait_for_job_execution() {
  local job_name="$1"
  local execution_name="$2"
  local label="$3"
  local max_attempts="${4:-90}"
  local attempt=1
  local status=""

  echo "==> Waiting for ${label} job execution: ${execution_name}"

  while (( attempt <= max_attempts )); do
    status="$(
      az containerapp job execution show \
        --name "${job_name}" \
        --resource-group "${AZURE_RESOURCE_GROUP}" \
        --job-execution-name "${execution_name}" \
        --query properties.status \
        -o tsv \
        --only-show-errors 2>/dev/null || true
    )"

    case "${status}" in
      Succeeded)
        echo "==> ${label} job succeeded"
        return 0
        ;;
      Failed|Canceled|Cancelled)
        echo "==> ${label} job failed with status: ${status}" >&2
        return 1
        ;;
      "")
        ;;
      *)
        echo "==> ${label} job status: ${status}"
        ;;
    esac

    sleep 10
    attempt=$((attempt + 1))
  done

  echo "==> ${label} job timed out after $((max_attempts * 10)) seconds" >&2
  return 1
}

start_manual_job() {
  local job_name="$1"
  local label="$2"
  local execution_name

  execution_name="$(
    az containerapp job start \
      --name "${job_name}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --query name \
      -o tsv \
      --only-show-errors
  )"

  if [[ -z "${execution_name}" ]]; then
    echo "Unable to determine execution name for ${label} job." >&2
    return 1
  fi

  wait_for_job_execution "${job_name}" "${execution_name}" "${label}" "${DB_JOB_POLL_ATTEMPTS}"
}

require_cmd az

for name in \
  AZURE_SUBSCRIPTION_ID \
  AZURE_RESOURCE_GROUP \
  AZURE_LOCATION \
  AZURE_ACR_NAME \
  AZURE_LOG_ANALYTICS_WORKSPACE \
  AZURE_CONTAINERAPPS_ENVIRONMENT \
  AZURE_MANAGED_IDENTITY_NAME \
  AZURE_FRONTEND_APP_NAME \
  AZURE_BACKEND_APP_NAME \
  AZURE_ROUTE_CONFIG_NAME \
  AZURE_MYSQL_SERVER_NAME \
  AZURE_MYSQL_DATABASE \
  AZURE_MYSQL_ADMIN_USERNAME \
  AZURE_MYSQL_ADMIN_PASSWORD \
  AZURE_REDIS_CLUSTER_NAME \
  AZURE_STORAGE_ACCOUNT_NAME \
  AZURE_STORAGE_CONTAINER_NAME \
  OPENAI_API_KEY \
  JWT_SECRET
do
  require_var "${name}"
done

BACKEND_IMAGE_REPOSITORY="${BACKEND_IMAGE_REPOSITORY:-flowpilot-backend}"
FRONTEND_IMAGE_REPOSITORY="${FRONTEND_IMAGE_REPOSITORY:-flowpilot-frontend}"
DB_SEED_IMAGE_REPOSITORY="${DB_SEED_IMAGE_REPOSITORY:-flowpilot-db-seed}"

DEFAULT_TAG="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
BACKEND_IMAGE_TAG="${BACKEND_IMAGE_TAG:-${DEFAULT_TAG}}"
FRONTEND_IMAGE_TAG="${FRONTEND_IMAGE_TAG:-${DEFAULT_TAG}}"
DB_SEED_IMAGE_TAG="${DB_SEED_IMAGE_TAG:-${DEFAULT_TAG}}"

AZURE_MYSQL_SKU="${AZURE_MYSQL_SKU:-Standard_B1ms}"
AZURE_MYSQL_TIER="${AZURE_MYSQL_TIER:-Burstable}"
AZURE_MYSQL_VERSION="${AZURE_MYSQL_VERSION:-8.0}"
AZURE_MYSQL_STORAGE_GB="${AZURE_MYSQL_STORAGE_GB:-32}"
AZURE_MYSQL_PUBLIC_ACCESS="${AZURE_MYSQL_PUBLIC_ACCESS:-0.0.0.0}"

AZURE_REDIS_SKU="${AZURE_REDIS_SKU:-Balanced_B0}"
AZURE_REDIS_CAPACITY="${AZURE_REDIS_CAPACITY:-1}"
AZURE_REDIS_DATABASE_NAME="${AZURE_REDIS_DATABASE_NAME:-default}"

AZURE_DB_MIGRATE_JOB_NAME="${AZURE_DB_MIGRATE_JOB_NAME:-flowpilot-db-migrate}"
AZURE_DB_SEED_JOB_NAME="${AZURE_DB_SEED_JOB_NAME:-flowpilot-db-seed}"
AZURE_RUN_DEMO_SEED="${AZURE_RUN_DEMO_SEED:-false}"

BACKEND_CPU="${BACKEND_CPU:-1.0}"
BACKEND_MEMORY="${BACKEND_MEMORY:-2.0Gi}"
BACKEND_MIN_REPLICAS="${BACKEND_MIN_REPLICAS:-1}"
BACKEND_MAX_REPLICAS="${BACKEND_MAX_REPLICAS:-3}"
BACKEND_WORKERS="${BACKEND_WORKERS:-1}"

FRONTEND_CPU="${FRONTEND_CPU:-0.5}"
FRONTEND_MEMORY="${FRONTEND_MEMORY:-1.0Gi}"
FRONTEND_MIN_REPLICAS="${FRONTEND_MIN_REPLICAS:-1}"
FRONTEND_MAX_REPLICAS="${FRONTEND_MAX_REPLICAS:-3}"

DB_JOB_CPU="${DB_JOB_CPU:-0.5}"
DB_JOB_MEMORY="${DB_JOB_MEMORY:-1.0Gi}"
DB_JOB_TIMEOUT="${DB_JOB_TIMEOUT:-1800}"
DB_JOB_POLL_ATTEMPTS="${DB_JOB_POLL_ATTEMPTS:-90}"

ACR_SERVER="${AZURE_ACR_NAME}.azurecr.io"
BACKEND_IMAGE="${ACR_SERVER}/${BACKEND_IMAGE_REPOSITORY}:${BACKEND_IMAGE_TAG}"
FRONTEND_IMAGE="${ACR_SERVER}/${FRONTEND_IMAGE_REPOSITORY}:${FRONTEND_IMAGE_TAG}"
DB_SEED_IMAGE="${ACR_SERVER}/${DB_SEED_IMAGE_REPOSITORY}:${DB_SEED_IMAGE_TAG}"
MYSQL_HOST_FQDN="${AZURE_MYSQL_SERVER_NAME}.mysql.database.azure.com"

JWT_SECRET_NAME="jwt-secret"
MYSQL_PASSWORD_SECRET_NAME="mysql-pass"
REDIS_PASSWORD_SECRET_NAME="redis-pass"
OPENAI_API_KEY_SECRET_NAME="openai-key"
STORAGE_CONNECTION_SECRET_NAME="storage-conn"

echo "==> Configuring Azure CLI"
az account set --subscription "${AZURE_SUBSCRIPTION_ID}"
az extension add --name containerapp --upgrade --only-show-errors >/dev/null
az extension add --name redisenterprise --upgrade --only-show-errors >/dev/null

for provider in \
  Microsoft.App \
  Microsoft.Cache \
  Microsoft.ContainerRegistry \
  Microsoft.DBforMySQL \
  Microsoft.ManagedIdentity \
  Microsoft.OperationalInsights \
  Microsoft.Storage
do
  az provider register --namespace "${provider}" --wait --only-show-errors >/dev/null
done

echo "==> Creating resource group"
az group create \
  --name "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}" \
  --output none

echo "==> Ensuring Azure Container Registry exists"
if ! resource_exists az acr show --name "${AZURE_ACR_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az acr create \
    --name "${AZURE_ACR_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --sku Basic \
    --admin-enabled false \
    --output none
fi
ACR_ID="$(az acr show --name "${AZURE_ACR_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query id -o tsv)"

echo "==> Ensuring user-assigned identity exists"
if ! resource_exists az identity show --name "${AZURE_MANAGED_IDENTITY_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az identity create \
    --name "${AZURE_MANAGED_IDENTITY_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --output none
fi
IDENTITY_ID="$(az identity show --name "${AZURE_MANAGED_IDENTITY_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query id -o tsv)"
IDENTITY_PRINCIPAL_ID="$(az identity show --name "${AZURE_MANAGED_IDENTITY_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query principalId -o tsv)"

az role assignment create \
  --assignee-object-id "${IDENTITY_PRINCIPAL_ID}" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope "${ACR_ID}" \
  --only-show-errors \
  >/dev/null 2>&1 || true

echo "==> Building and pushing production images to ACR"
(
  cd "${ROOT_DIR}"
  az acr build \
    --registry "${AZURE_ACR_NAME}" \
    --image "${BACKEND_IMAGE_REPOSITORY}:${BACKEND_IMAGE_TAG}" \
    --file backend/Dockerfile.prod \
    backend \
    --only-show-errors

  az acr build \
    --registry "${AZURE_ACR_NAME}" \
    --image "${FRONTEND_IMAGE_REPOSITORY}:${FRONTEND_IMAGE_TAG}" \
    --file frontend/Dockerfile.prod \
    frontend \
    --only-show-errors

  if is_truthy "${AZURE_RUN_DEMO_SEED}"; then
    az acr build \
      --registry "${AZURE_ACR_NAME}" \
      --image "${DB_SEED_IMAGE_REPOSITORY}:${DB_SEED_IMAGE_TAG}" \
      --file database/Dockerfile.seed \
      database \
      --only-show-errors
  fi
)

echo "==> Ensuring Log Analytics workspace exists"
if ! resource_exists az monitor log-analytics workspace show --resource-group "${AZURE_RESOURCE_GROUP}" --workspace-name "${AZURE_LOG_ANALYTICS_WORKSPACE}" --only-show-errors; then
  az monitor log-analytics workspace create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --workspace-name "${AZURE_LOG_ANALYTICS_WORKSPACE}" \
    --location "${AZURE_LOCATION}" \
    --output none
fi
WORKSPACE_ID="$(az monitor log-analytics workspace show --resource-group "${AZURE_RESOURCE_GROUP}" --workspace-name "${AZURE_LOG_ANALYTICS_WORKSPACE}" --query customerId -o tsv)"
WORKSPACE_KEY="$(az monitor log-analytics workspace get-shared-keys --resource-group "${AZURE_RESOURCE_GROUP}" --workspace-name "${AZURE_LOG_ANALYTICS_WORKSPACE}" --query primarySharedKey -o tsv)"

echo "==> Ensuring Container Apps environment exists"
if ! resource_exists az containerapp env show --name "${AZURE_CONTAINERAPPS_ENVIRONMENT}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az containerapp env create \
    --name "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --logs-workspace-id "${WORKSPACE_ID}" \
    --logs-workspace-key "${WORKSPACE_KEY}" \
    --output none
fi

echo "==> Ensuring Storage Account exists"
if ! resource_exists az storage account show --name "${AZURE_STORAGE_ACCOUNT_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az storage account create \
    --name "${AZURE_STORAGE_ACCOUNT_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --output none
fi
STORAGE_CONNECTION_STRING="$(az storage account show-connection-string --name "${AZURE_STORAGE_ACCOUNT_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query connectionString -o tsv)"
az storage container create \
  --name "${AZURE_STORAGE_CONTAINER_NAME}" \
  --connection-string "${STORAGE_CONNECTION_STRING}" \
  --fail-on-exist false \
  --output none

echo "==> Ensuring Azure Database for MySQL Flexible Server exists"
if ! resource_exists az mysql flexible-server show --name "${AZURE_MYSQL_SERVER_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az mysql flexible-server create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --name "${AZURE_MYSQL_SERVER_NAME}" \
    --admin-user "${AZURE_MYSQL_ADMIN_USERNAME}" \
    --admin-password "${AZURE_MYSQL_ADMIN_PASSWORD}" \
    --database-name "${AZURE_MYSQL_DATABASE}" \
    --sku-name "${AZURE_MYSQL_SKU}" \
    --tier "${AZURE_MYSQL_TIER}" \
    --version "${AZURE_MYSQL_VERSION}" \
    --storage-size "${AZURE_MYSQL_STORAGE_GB}" \
    --public-access "${AZURE_MYSQL_PUBLIC_ACCESS}" \
    --yes \
    --output none
fi

if ! resource_exists az mysql flexible-server db show --resource-group "${AZURE_RESOURCE_GROUP}" --server-name "${AZURE_MYSQL_SERVER_NAME}" --database-name "${AZURE_MYSQL_DATABASE}" --only-show-errors; then
  az mysql flexible-server db create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --server-name "${AZURE_MYSQL_SERVER_NAME}" \
    --database-name "${AZURE_MYSQL_DATABASE}" \
    --output none
fi

echo "==> Ensuring Azure Managed Redis exists"
if ! resource_exists az redisenterprise show --name "${AZURE_REDIS_CLUSTER_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az redisenterprise create \
    --name "${AZURE_REDIS_CLUSTER_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --sku "${AZURE_REDIS_SKU}" \
    --capacity "${AZURE_REDIS_CAPACITY}" \
    --minimum-tls-version 1.2 \
    --output none
fi

if ! resource_exists az redisenterprise database show --cluster-name "${AZURE_REDIS_CLUSTER_NAME}" --database-name "${AZURE_REDIS_DATABASE_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az redisenterprise database create \
    --cluster-name "${AZURE_REDIS_CLUSTER_NAME}" \
    --database-name "${AZURE_REDIS_DATABASE_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --access-keys-authentication Enabled \
    --client-protocol Encrypted \
    --clustering-policy NoCluster \
    --eviction-policy NoEviction \
    --port 10000 \
    --yes \
    --output none
fi

REDIS_HOST_FQDN="$(az redisenterprise show --name "${AZURE_REDIS_CLUSTER_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query hostName -o tsv)"
REDIS_PRIMARY_KEY="$(az redisenterprise database list-keys --cluster-name "${AZURE_REDIS_CLUSTER_NAME}" --database-name "${AZURE_REDIS_DATABASE_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query primaryKey -o tsv)"

BACKEND_SECRETS=(
  "${JWT_SECRET_NAME}=${JWT_SECRET}"
  "${MYSQL_PASSWORD_SECRET_NAME}=${AZURE_MYSQL_ADMIN_PASSWORD}"
  "${REDIS_PASSWORD_SECRET_NAME}=${REDIS_PRIMARY_KEY}"
  "${OPENAI_API_KEY_SECRET_NAME}=${OPENAI_API_KEY}"
  "${STORAGE_CONNECTION_SECRET_NAME}=${STORAGE_CONNECTION_STRING}"
)
BACKEND_COMMON_ENV_VARS=(
  "ENVIRONMENT=production"
  "APP_HOST=0.0.0.0"
  "APP_PORT=8000"
  "MYSQL_HOST=${MYSQL_HOST_FQDN}"
  "MYSQL_HOST_PORT=3306"
  "MYSQL_PORT=3306"
  "MYSQL_DATABASE=${AZURE_MYSQL_DATABASE}"
  "MYSQL_USER=${AZURE_MYSQL_ADMIN_USERNAME}"
  "MYSQL_PASSWORD=secretref:${MYSQL_PASSWORD_SECRET_NAME}"
  "MYSQL_SSL_ENABLED=true"
  "REDIS_HOST=${REDIS_HOST_FQDN}"
  "REDIS_PORT=10000"
  "REDIS_PASSWORD=secretref:${REDIS_PASSWORD_SECRET_NAME}"
  "REDIS_SSL=true"
  "REDIS_DB=0"
  "SECRET_KEY=secretref:${JWT_SECRET_NAME}"
  "ALGORITHM=HS256"
  "ACCESS_TOKEN_EXPIRE_MINUTES=15"
  "REFRESH_TOKEN_EXPIRE_DAYS=7"
  "OPENAI_API_KEY=secretref:${OPENAI_API_KEY_SECRET_NAME}"
  "AZURE_STORAGE_CONNECTION_STRING=secretref:${STORAGE_CONNECTION_SECRET_NAME}"
  "AZURE_STORAGE_CONTAINER_NAME=${AZURE_STORAGE_CONTAINER_NAME}"
  "CORS_ORIGINS=https://placeholder.invalid"
)
BACKEND_ENV_VARS=(
  "${BACKEND_COMMON_ENV_VARS[@]}"
  "BACKEND_WORKERS=${BACKEND_WORKERS}"
)

echo "==> Creating or updating database migration job"
if resource_exists az containerapp job show --name "${AZURE_DB_MIGRATE_JOB_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az containerapp job identity assign \
    --name "${AZURE_DB_MIGRATE_JOB_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --user-assigned "${IDENTITY_ID}" \
    --output none
  az containerapp job registry set \
    --name "${AZURE_DB_MIGRATE_JOB_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --server "${ACR_SERVER}" \
    --identity "${IDENTITY_ID}" \
    --output none
  az containerapp job secret set \
    --name "${AZURE_DB_MIGRATE_JOB_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --secrets "${BACKEND_SECRETS[@]}" \
    --output none
  az containerapp job update \
    --name "${AZURE_DB_MIGRATE_JOB_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --image "${BACKEND_IMAGE}" \
    --cpu "${DB_JOB_CPU}" \
    --memory "${DB_JOB_MEMORY}" \
    --parallelism 1 \
    --replica-timeout "${DB_JOB_TIMEOUT}" \
    --replica-retry-limit 1 \
    --replica-completion-count 1 \
    --command "python" \
    --args "scripts/migrate_db.py" \
    --replace-env-vars "${BACKEND_COMMON_ENV_VARS[@]}" \
    --output none
else
  az containerapp job create \
    --name "${AZURE_DB_MIGRATE_JOB_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --environment "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
    --trigger-type Manual \
    --image "${BACKEND_IMAGE}" \
    --cpu "${DB_JOB_CPU}" \
    --memory "${DB_JOB_MEMORY}" \
    --parallelism 1 \
    --replica-timeout "${DB_JOB_TIMEOUT}" \
    --replica-retry-limit 1 \
    --replica-completion-count 1 \
    --command "python" \
    --args "scripts/migrate_db.py" \
    --mi-user-assigned "${IDENTITY_ID}" \
    --registry-server "${ACR_SERVER}" \
    --registry-identity "${IDENTITY_ID}" \
    --secrets "${BACKEND_SECRETS[@]}" \
    --env-vars "${BACKEND_COMMON_ENV_VARS[@]}" \
    --output none
fi
start_manual_job "${AZURE_DB_MIGRATE_JOB_NAME}" "database migration"

if is_truthy "${AZURE_RUN_DEMO_SEED}"; then
  echo "==> Creating or updating demo seed job"
  DB_SEED_SECRETS=(
    "${MYSQL_PASSWORD_SECRET_NAME}=${AZURE_MYSQL_ADMIN_PASSWORD}"
  )
  DB_SEED_ENV_VARS=(
    "MYSQL_HOST=${MYSQL_HOST_FQDN}"
    "MYSQL_PORT=3306"
    "MYSQL_USER=${AZURE_MYSQL_ADMIN_USERNAME}"
    "MYSQL_PASSWORD=secretref:${MYSQL_PASSWORD_SECRET_NAME}"
    "MYSQL_DATABASE=${AZURE_MYSQL_DATABASE}"
    "MYSQL_SSL_MODE=REQUIRED"
    "SEED_SQL_PATH=/seed/backup.sql"
  )

  if resource_exists az containerapp job show --name "${AZURE_DB_SEED_JOB_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
    az containerapp job identity assign \
      --name "${AZURE_DB_SEED_JOB_NAME}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --user-assigned "${IDENTITY_ID}" \
      --output none
    az containerapp job registry set \
      --name "${AZURE_DB_SEED_JOB_NAME}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --server "${ACR_SERVER}" \
      --identity "${IDENTITY_ID}" \
      --output none
    az containerapp job secret set \
      --name "${AZURE_DB_SEED_JOB_NAME}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --secrets "${DB_SEED_SECRETS[@]}" \
      --output none
    az containerapp job update \
      --name "${AZURE_DB_SEED_JOB_NAME}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --image "${DB_SEED_IMAGE}" \
      --cpu "${DB_JOB_CPU}" \
      --memory "${DB_JOB_MEMORY}" \
      --parallelism 1 \
      --replica-timeout "${DB_JOB_TIMEOUT}" \
      --replica-retry-limit 1 \
      --replica-completion-count 1 \
      --replace-env-vars "${DB_SEED_ENV_VARS[@]}" \
      --output none
  else
    az containerapp job create \
      --name "${AZURE_DB_SEED_JOB_NAME}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --environment "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
      --trigger-type Manual \
      --image "${DB_SEED_IMAGE}" \
      --cpu "${DB_JOB_CPU}" \
      --memory "${DB_JOB_MEMORY}" \
      --parallelism 1 \
      --replica-timeout "${DB_JOB_TIMEOUT}" \
      --replica-retry-limit 1 \
      --replica-completion-count 1 \
      --mi-user-assigned "${IDENTITY_ID}" \
      --registry-server "${ACR_SERVER}" \
      --registry-identity "${IDENTITY_ID}" \
      --secrets "${DB_SEED_SECRETS[@]}" \
      --env-vars "${DB_SEED_ENV_VARS[@]}" \
      --output none
  fi
  start_manual_job "${AZURE_DB_SEED_JOB_NAME}" "demo seed"
else
  echo "==> Skipping demo seed job because AZURE_RUN_DEMO_SEED is not enabled"
fi

echo "==> Creating or updating backend container app"
if resource_exists az containerapp show --name "${AZURE_BACKEND_APP_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az containerapp identity assign \
    --name "${AZURE_BACKEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --user-assigned "${IDENTITY_ID}" \
    --output none
  az containerapp registry set \
    --name "${AZURE_BACKEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --server "${ACR_SERVER}" \
    --identity "${IDENTITY_ID}" \
    --output none
  az containerapp secret set \
    --name "${AZURE_BACKEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --secrets "${BACKEND_SECRETS[@]}" \
    --output none
  az containerapp update \
    --name "${AZURE_BACKEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --image "${BACKEND_IMAGE}" \
    --cpu "${BACKEND_CPU}" \
    --memory "${BACKEND_MEMORY}" \
    --min-replicas "${BACKEND_MIN_REPLICAS}" \
    --max-replicas "${BACKEND_MAX_REPLICAS}" \
    --set-env-vars "${BACKEND_ENV_VARS[@]}" \
    --output none
else
  az containerapp create \
    --name "${AZURE_BACKEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --environment "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
    --image "${BACKEND_IMAGE}" \
    --target-port 8000 \
    --ingress external \
    --user-assigned "${IDENTITY_ID}" \
    --registry-server "${ACR_SERVER}" \
    --registry-identity "${IDENTITY_ID}" \
    --secrets "${BACKEND_SECRETS[@]}" \
    --env-vars "${BACKEND_ENV_VARS[@]}" \
    --cpu "${BACKEND_CPU}" \
    --memory "${BACKEND_MEMORY}" \
    --min-replicas "${BACKEND_MIN_REPLICAS}" \
    --max-replicas "${BACKEND_MAX_REPLICAS}" \
    --output none
fi
BACKEND_FQDN="$(az containerapp show --name "${AZURE_BACKEND_APP_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv)"

echo "==> Creating or updating frontend container app"
FRONTEND_ENV_VARS=(
  "NEXT_PUBLIC_API_BASE_URL=same-origin"
  "NEXT_PUBLIC_API_PORT="
  "API_BASE_URL_INTERNAL=https://${BACKEND_FQDN}"
)

if resource_exists az containerapp show --name "${AZURE_FRONTEND_APP_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --only-show-errors; then
  az containerapp identity assign \
    --name "${AZURE_FRONTEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --user-assigned "${IDENTITY_ID}" \
    --output none
  az containerapp registry set \
    --name "${AZURE_FRONTEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --server "${ACR_SERVER}" \
    --identity "${IDENTITY_ID}" \
    --output none
  az containerapp update \
    --name "${AZURE_FRONTEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --image "${FRONTEND_IMAGE}" \
    --cpu "${FRONTEND_CPU}" \
    --memory "${FRONTEND_MEMORY}" \
    --min-replicas "${FRONTEND_MIN_REPLICAS}" \
    --max-replicas "${FRONTEND_MAX_REPLICAS}" \
    --set-env-vars "${FRONTEND_ENV_VARS[@]}" \
    --output none
else
  az containerapp create \
    --name "${AZURE_FRONTEND_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --environment "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
    --image "${FRONTEND_IMAGE}" \
    --target-port 3000 \
    --ingress external \
    --user-assigned "${IDENTITY_ID}" \
    --registry-server "${ACR_SERVER}" \
    --registry-identity "${IDENTITY_ID}" \
    --env-vars "${FRONTEND_ENV_VARS[@]}" \
    --cpu "${FRONTEND_CPU}" \
    --memory "${FRONTEND_MEMORY}" \
    --min-replicas "${FRONTEND_MIN_REPLICAS}" \
    --max-replicas "${FRONTEND_MAX_REPLICAS}" \
    --output none
fi

ROUTING_FILE="$(mktemp)"
cat > "${ROUTING_FILE}" <<EOF
rules:
  - description: "Backend API and auth routes"
    routes:
      - match:
          prefix: /api
      - match:
          path: /login
      - match:
          path: /logout-all
      - match:
          path: /logout
      - match:
          path: /refresh
      - match:
          path: /change-password
      - match:
          prefix: /me
    targets:
      - containerApp: ${AZURE_BACKEND_APP_NAME}
  - description: "Frontend catch-all"
    routes:
      - match:
          prefix: /
    targets:
      - containerApp: ${AZURE_FRONTEND_APP_NAME}
EOF

echo "==> Creating or updating route config"
if resource_exists az containerapp env http-route-config show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${AZURE_CONTAINERAPPS_ENVIRONMENT}" --http-route-config-name "${AZURE_ROUTE_CONFIG_NAME}" --only-show-errors; then
  az containerapp env http-route-config update \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
    --http-route-config-name "${AZURE_ROUTE_CONFIG_NAME}" \
    --yaml "${ROUTING_FILE}" \
    --output none
else
  az containerapp env http-route-config create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINERAPPS_ENVIRONMENT}" \
    --http-route-config-name "${AZURE_ROUTE_CONFIG_NAME}" \
    --yaml "${ROUTING_FILE}" \
    --output none
fi

PUBLIC_FQDN="$(az containerapp env http-route-config show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${AZURE_CONTAINERAPPS_ENVIRONMENT}" --http-route-config-name "${AZURE_ROUTE_CONFIG_NAME}" --query properties.fqdn -o tsv)"
rm -f "${ROUTING_FILE}"

echo "==> Updating backend CORS to final public URL"
az containerapp update \
  --name "${AZURE_BACKEND_APP_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --set-env-vars \
    "CORS_ORIGINS=https://${PUBLIC_FQDN}" \
  --output none

cat <<EOF

Azure deployment is ready.

Public app URL:
  https://${PUBLIC_FQDN}

Direct backend URL:
  https://${BACKEND_FQDN}

Notes:
  - End users should use the public app URL above.
  - The frontend container app FQDN is not the final entrypoint because auth/API routing is handled by the environment route config.
  - This script uses managed Azure services, but keeps MySQL on public access (0.0.0.0 for Azure resources) for the first deploy. Move to private networking later if you want stricter hardening.
EOF
