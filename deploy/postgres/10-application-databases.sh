#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${POSTGRES_PASSWORD:?PostgreSQL administrator password is required}"

# Called by the PostgreSQL image on a new data volume. Passwords arrive only through secret environment values.
# It is also safe to run explicitly when adding a database to an existing development volume.
requested_database="${NEXORA_PROVISION_DATABASE:-}"
matched=false
for definition in ${NEXORA_DATABASES:?Database definitions are required}; do
    IFS=: read -r database role password_variable <<< "$definition"
    if [[ -n "$requested_database" && "$requested_database" != "$database" ]]; then
        continue
    fi
    matched=true
    password="${!password_variable:?Database password is required}"
    psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
        --set=database="$database" --set=role="$role" --set=password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" PASSWORD :'password';
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database') \gexec
ALTER DATABASE :"database" OWNER TO :"role";
REVOKE ALL ON DATABASE :"database" FROM PUBLIC;
SQL
    if [[ -n "${NEXORA_RESTORE_DIRECTORY:-}" ]]; then
        pg_restore --username "$POSTGRES_USER" --dbname "$database" --role "$role" \
            --no-owner --no-acl --clean --if-exists --exit-on-error "$NEXORA_RESTORE_DIRECTORY/$database.dump"
    fi
    psql --username "$POSTGRES_USER" --dbname "$database" --set=ON_ERROR_STOP=1 --set=role="$role" <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"role";
SQL
done
if [[ "$matched" == false ]]; then
    echo "Requested database is not in the AppHost model." >&2
    exit 1
fi
