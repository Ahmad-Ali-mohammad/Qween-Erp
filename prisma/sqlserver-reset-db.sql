-- ==========================================================
-- ERP Qween - SQL Server Reset Database
-- WARNING: This will DELETE the whole database and all data.
-- ==========================================================

USE [master];
GO

IF DB_ID(N'erp_qween') IS NOT NULL
BEGIN
  ALTER DATABASE [erp_qween] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [erp_qween];
END
GO

CREATE DATABASE [erp_qween];
GO

PRINT N'erp_qween database has been recreated successfully.';
GO
