# Backup & Restore

## Backup
`docker exec erp_qween_postgres pg_dump -U erp_user erp_qween > backup.sql`

## Restore
`cat backup.sql | docker exec -i erp_qween_postgres psql -U erp_user -d erp_qween`
