-- ==========================================================
-- ERP Qween - SQL Server Full Schema
-- Auto-converted from prisma/schema.mysql.sql
-- NOTE: MySQL DECIMAL(65,30) was converted to DECIMAL(38,18) where needed
-- ==========================================================

IF DB_ID(N'erp_qween') IS NULL
BEGIN
  CREATE DATABASE [erp_qween];
END
GO
USE [erp_qween];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE [CompanyProfile] (
  [id] INT DEFAULT (1) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [commercialRegistration] NVARCHAR(191) NULL,
  [taxNumber] NVARCHAR(191) NULL,
  [vatNumber] NVARCHAR(191) NULL,
  [address] NVARCHAR(191) NULL,
  [city] NVARCHAR(191) NULL,
  [phone] NVARCHAR(191) NULL,
  [email] NVARCHAR(191) NULL,
  [logo] NVARCHAR(191) NULL,
  [fiscalYearStartMonth] INT DEFAULT (1) NOT NULL,
  [currency] NVARCHAR(191) DEFAULT ('SAR') NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [CompanyProfile_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SystemSettings] (
  [id] INT DEFAULT (1) NOT NULL,
  [allowNegativeStock] BIT DEFAULT (0) NOT NULL,
  [requireApproval] BIT DEFAULT (1) NOT NULL,
  [approvalThreshold] DECIMAL(38, 18) DEFAULT (10000) NOT NULL,
  [invoicePrefix] NVARCHAR(191) DEFAULT ('INV') NOT NULL,
  [quotePrefix] NVARCHAR(191) DEFAULT ('QT') NOT NULL,
  [postingAccounts] NVARCHAR(MAX) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [SystemSettings_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Role] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [description] NVARCHAR(191) NULL,
  [permissions] NVARCHAR(MAX) NOT NULL,
  [isSystem] BIT DEFAULT (0) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [Role_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [User] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [username] NVARCHAR(191) NOT NULL,
  [email] NVARCHAR(191) NOT NULL,
  [password] NVARCHAR(191) NOT NULL,
  [fullName] NVARCHAR(191) NOT NULL,
  [phone] NVARCHAR(191) NULL,
  [position] NVARCHAR(191) NULL,
  [roleId] INT NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [failedLoginCount] INT DEFAULT (0) NOT NULL,
  [lockedUntil] DATETIME2(3) NULL,
  [lastLogin] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [User_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [AuthSession] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NOT NULL,
  [refreshToken] NVARCHAR(191) NOT NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [revokedAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [AuthSession_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Account] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [type] NVARCHAR(50) NOT NULL,
  [subType] NVARCHAR(191) NULL,
  [parentId] INT NULL,
  [level] INT DEFAULT (1) NOT NULL,
  [isControl] BIT DEFAULT (0) NOT NULL,
  [allowPosting] BIT DEFAULT (1) NOT NULL,
  [normalBalance] NVARCHAR(191) DEFAULT ('Debit') NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Account_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [AccountBalance] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [accountId] INT NOT NULL,
  [fiscalYear] INT NOT NULL,
  [period] INT NOT NULL,
  [openingBalance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [debit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [credit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [closingBalance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [AccountBalance_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [FiscalYear] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [startDate] DATETIME2(3) NOT NULL,
  [endDate] DATETIME2(3) NOT NULL,
  [status] NVARCHAR(50) DEFAULT ('OPEN') NOT NULL,
  [isCurrent] BIT DEFAULT (0) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [FiscalYear_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [AccountingPeriod] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [fiscalYearId] INT NOT NULL,
  [number] INT NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [startDate] DATETIME2(3) NOT NULL,
  [endDate] DATETIME2(3) NOT NULL,
  [status] NVARCHAR(50) DEFAULT ('OPEN') NOT NULL,
  [canPost] BIT DEFAULT (1) NOT NULL,
  [closedAt] DATETIME2(3) NULL,
  [closedBy] INT NULL,
  CONSTRAINT [AccountingPeriod_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [JournalEntry] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [entryNumber] NVARCHAR(191) NOT NULL,
  [date] DATETIME2(3) NOT NULL,
  [periodId] INT NULL,
  [description] NVARCHAR(191) NULL,
  [reference] NVARCHAR(191) NULL,
  [source] NVARCHAR(50) DEFAULT ('MANUAL') NOT NULL,
  [status] NVARCHAR(50) DEFAULT ('DRAFT') NOT NULL,
  [totalDebit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [totalCredit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [attachmentCount] INT DEFAULT (0) NOT NULL,
  [notes] NVARCHAR(191) NULL,
  [createdById] INT NOT NULL,
  [postedById] INT NULL,
  [postedAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [JournalEntry_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [JournalLine] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [entryId] INT NOT NULL,
  [lineNumber] INT NOT NULL,
  [accountId] INT NOT NULL,
  [description] NVARCHAR(191) NULL,
  [debit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [credit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [projectId] INT NULL,
  [departmentId] INT NULL,
  [costCenterId] INT NULL,
  [employeeId] INT NULL,
  [isCleared] BIT DEFAULT (0) NOT NULL,
  [clearedAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [JournalLine_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Project] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [type] NVARCHAR(191) NULL,
  [status] NVARCHAR(191) DEFAULT ('Active') NOT NULL,
  [startDate] DATETIME2(3) NULL,
  [endDate] DATETIME2(3) NULL,
  [budget] DECIMAL(38, 18) NULL,
  [actualCost] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [managerId] INT NULL,
  [description] NVARCHAR(191) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Project_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Department] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [parentId] INT NULL,
  [managerId] INT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [Department_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [CostCenter] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [budget] DECIMAL(38, 18) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [CostCenter_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Customer] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [type] NVARCHAR(191) DEFAULT ('Company') NOT NULL,
  [nationalId] NVARCHAR(191) NULL,
  [taxNumber] NVARCHAR(191) NULL,
  [vatNumber] NVARCHAR(191) NULL,
  [address] NVARCHAR(191) NULL,
  [city] NVARCHAR(191) NULL,
  [phone] NVARCHAR(191) NULL,
  [mobile] NVARCHAR(191) NULL,
  [email] NVARCHAR(191) NULL,
  [creditLimit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [currentBalance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [paymentTerms] INT DEFAULT (30) NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Customer_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Supplier] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [type] NVARCHAR(191) DEFAULT ('Local') NOT NULL,
  [nationalId] NVARCHAR(191) NULL,
  [taxNumber] NVARCHAR(191) NULL,
  [vatNumber] NVARCHAR(191) NULL,
  [address] NVARCHAR(191) NULL,
  [city] NVARCHAR(191) NULL,
  [phone] NVARCHAR(191) NULL,
  [mobile] NVARCHAR(191) NULL,
  [email] NVARCHAR(191) NULL,
  [creditLimit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [currentBalance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [paymentTerms] INT DEFAULT (30) NOT NULL,
  [bankName] NVARCHAR(191) NULL,
  [bankAccount] NVARCHAR(191) NULL,
  [iban] NVARCHAR(191) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Supplier_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Contact] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [customerId] INT NULL,
  [supplierId] INT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [position] NVARCHAR(191) NULL,
  [phone] NVARCHAR(191) NULL,
  [mobile] NVARCHAR(191) NULL,
  [email] NVARCHAR(191) NULL,
  [isPrimary] BIT DEFAULT (0) NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [Contact_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Invoice] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [type] NVARCHAR(50) NOT NULL,
  [date] DATETIME2(3) NOT NULL,
  [dueDate] DATETIME2(3) NULL,
  [customerId] INT NULL,
  [supplierId] INT NULL,
  [subtotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [discount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxableAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [vatRate] DECIMAL(38, 18) DEFAULT (15) NOT NULL,
  [vatAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [withholdingTax] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [total] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [paidAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [outstanding] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [status] NVARCHAR(50) DEFAULT ('DRAFT') NOT NULL,
  [paymentStatus] NVARCHAR(191) DEFAULT ('PENDING') NOT NULL,
  [projectId] INT NULL,
  [notes] NVARCHAR(191) NULL,
  [internalNotes] NVARCHAR(191) NULL,
  [zatcaUuid] NVARCHAR(191) NULL,
  [zatcaHash] NVARCHAR(191) NULL,
  [zatcaQr] NVARCHAR(191) NULL,
  [isZatcaCompliant] BIT DEFAULT (0) NOT NULL,
  [createdById] INT NULL,
  [journalEntryId] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Invoice_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [InvoiceLine] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [invoiceId] INT NOT NULL,
  [lineNumber] INT NOT NULL,
  [itemId] INT NULL,
  [description] NVARCHAR(191) NOT NULL,
  [quantity] DECIMAL(38, 18) DEFAULT (1) NOT NULL,
  [unitPrice] DECIMAL(38, 18) NOT NULL,
  [discount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxRate] DECIMAL(38, 18) DEFAULT (15) NOT NULL,
  [taxAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [total] DECIMAL(38, 18) NOT NULL,
  [accountId] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [InvoiceLine_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [BankAccount] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [accountNumber] NVARCHAR(191) NOT NULL,
  [iban] NVARCHAR(191) NULL,
  [bankName] NVARCHAR(191) NOT NULL,
  [currency] NVARCHAR(191) DEFAULT ('SAR') NOT NULL,
  [accountType] NVARCHAR(191) DEFAULT ('Current') NOT NULL,
  [openingBalance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [currentBalance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [glAccountId] INT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [BankAccount_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [BankTransaction] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [bankId] INT NOT NULL,
  [date] DATETIME2(3) NOT NULL,
  [valueDate] DATETIME2(3) NULL,
  [reference] NVARCHAR(191) NULL,
  [description] NVARCHAR(191) NOT NULL,
  [debit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [credit] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [balance] DECIMAL(38, 18) NULL,
  [type] NVARCHAR(191) NULL,
  [counterparty] NVARCHAR(191) NULL,
  [isReconciled] BIT DEFAULT (0) NOT NULL,
  [reconciledAt] DATETIME2(3) NULL,
  [journalEntryId] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [BankTransaction_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Payment] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [date] DATETIME2(3) NOT NULL,
  [type] NVARCHAR(50) NOT NULL,
  [method] NVARCHAR(50) NOT NULL,
  [amount] DECIMAL(38, 18) NOT NULL,
  [currency] NVARCHAR(191) DEFAULT ('SAR') NOT NULL,
  [bankId] INT NULL,
  [customerId] INT NULL,
  [supplierId] INT NULL,
  [checkNumber] NVARCHAR(191) NULL,
  [checkDate] DATETIME2(3) NULL,
  [checkBank] NVARCHAR(191) NULL,
  [status] NVARCHAR(50) DEFAULT ('PENDING') NOT NULL,
  [description] NVARCHAR(191) NULL,
  [notes] NVARCHAR(191) NULL,
  [journalEntryId] INT NULL,
  [createdById] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Payment_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PaymentAllocation] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [paymentId] INT NOT NULL,
  [invoiceId] INT NOT NULL,
  [amount] DECIMAL(38, 18) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [PaymentAllocation_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [AssetCategory] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [depreciationMethod] NVARCHAR(191) DEFAULT ('StraightLine') NOT NULL,
  [usefulLifeMonths] INT NOT NULL,
  [salvagePercent] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [glAssetId] INT NULL,
  [glAccumulatedId] INT NULL,
  [glExpenseId] INT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [AssetCategory_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [FixedAsset] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [categoryId] INT NOT NULL,
  [serialNumber] NVARCHAR(191) NULL,
  [model] NVARCHAR(191) NULL,
  [manufacturer] NVARCHAR(191) NULL,
  [purchaseDate] DATETIME2(3) NULL,
  [purchaseCost] DECIMAL(38, 18) NOT NULL,
  [supplierId] INT NULL,
  [usefulLifeMonths] INT NULL,
  [depreciationMethod] NVARCHAR(191) NULL,
  [salvageValue] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [depreciationStart] DATETIME2(3) NULL,
  [accumulatedDepreciation] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [netBookValue] DECIMAL(38, 18) NOT NULL,
  [location] NVARCHAR(191) NULL,
  [departmentId] INT NULL,
  [custodianId] INT NULL,
  [status] NVARCHAR(50) DEFAULT ('ACTIVE') NOT NULL,
  [isDepreciating] BIT DEFAULT (1) NOT NULL,
  [lastDepreciationDate] DATETIME2(3) NULL,
  [notes] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [FixedAsset_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [DepreciationSchedule] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [assetId] INT NOT NULL,
  [fiscalYear] INT NOT NULL,
  [period] INT NOT NULL,
  [openingNBV] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [expense] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [accumulated] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [closingNBV] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [journalEntryId] INT NULL,
  [status] NVARCHAR(191) DEFAULT ('Pending') NOT NULL,
  [postedAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [DepreciationSchedule_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Budget] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [fiscalYear] INT NOT NULL,
  [version] NVARCHAR(191) DEFAULT ('Original') NOT NULL,
  [status] NVARCHAR(50) DEFAULT ('DRAFT') NOT NULL,
  [controlLevel] NVARCHAR(50) DEFAULT ('NONE') NOT NULL,
  [totalAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Budget_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [BudgetLine] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [budgetId] INT NOT NULL,
  [accountId] INT NOT NULL,
  [period] INT NOT NULL,
  [amount] DECIMAL(38, 18) NOT NULL,
  [actual] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [committed] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [variance] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [BudgetLine_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [TaxCode] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [type] NVARCHAR(50) NOT NULL,
  [rate] DECIMAL(38, 18) NOT NULL,
  [isRecoverable] BIT DEFAULT (1) NOT NULL,
  [glPayableId] INT NULL,
  [glRecoverableId] INT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [TaxCode_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [TaxDeclaration] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [periodStart] DATETIME2(3) NOT NULL,
  [periodEnd] DATETIME2(3) NOT NULL,
  [type] NVARCHAR(50) DEFAULT ('VAT') NOT NULL,
  [totalSales] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [totalPurchases] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [outputTax] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [inputTax] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [netPayable] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [filedDate] DATETIME2(3) NULL,
  [filedReference] NVARCHAR(191) NULL,
  [paidDate] DATETIME2(3) NULL,
  [paidReference] NVARCHAR(191) NULL,
  [status] NVARCHAR(50) DEFAULT ('DRAFT') NOT NULL,
  [notes] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [TaxDeclaration_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [AuditLog] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NULL,
  [table] NVARCHAR(191) NOT NULL,
  [recordId] INT NULL,
  [action] NVARCHAR(191) NOT NULL,
  [oldValue] NVARCHAR(MAX) NULL,
  [newValue] NVARCHAR(MAX) NULL,
  [ipAddress] NVARCHAR(191) NULL,
  [userAgent] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [AuditLog_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [ItemCategory] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [ItemCategory_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Unit] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Unit_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Item] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [nameEn] NVARCHAR(191) NULL,
  [categoryId] INT NULL,
  [unitId] INT NULL,
  [salePrice] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [purchasePrice] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [reorderPoint] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [minStock] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [maxStock] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [onHandQty] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [inventoryValue] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Item_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Warehouse] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [location] NVARCHAR(191) NULL,
  [manager] NVARCHAR(191) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Warehouse_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [WarehouseLocation] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [warehouseId] INT NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [WarehouseLocation_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [StockMovement] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [type] NVARCHAR(191) NOT NULL,
  [reference] NVARCHAR(191) NULL,
  [itemId] INT NOT NULL,
  [warehouseId] INT NOT NULL,
  [locationId] INT NULL,
  [quantity] DECIMAL(38, 18) NOT NULL,
  [unitCost] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [totalCost] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [notes] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [StockMovement_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [StockBalance] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [itemId] INT NOT NULL,
  [warehouseId] INT NOT NULL,
  [locationId] INT NULL,
  [quantity] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [avgCost] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [value] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [StockBalance_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [StockCount] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [warehouseId] INT NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [notes] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [StockCount_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [StockCountLine] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [stockCountId] INT NOT NULL,
  [itemId] INT NOT NULL,
  [theoreticalQty] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [actualQty] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [differenceQty] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [unitCost] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [differenceValue] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  CONSTRAINT [StockCountLine_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SalesQuote] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [customerId] INT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [subtotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [discount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [total] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [validUntil] DATETIME2(3) NULL,
  [notes] NVARCHAR(191) NULL,
  [lines] NVARCHAR(MAX) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [SalesQuote_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SalesReturn] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [customerId] INT NULL,
  [invoiceId] INT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [subtotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [total] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [reason] NVARCHAR(191) NULL,
  [lines] NVARCHAR(MAX) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [SalesReturn_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PurchaseOrder] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [supplierId] INT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [expectedDate] DATETIME2(3) NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [subtotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [discount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [total] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [notes] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [PurchaseOrder_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PurchaseReturn] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [supplierId] INT NULL,
  [invoiceId] INT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [subtotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxAmount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [total] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [reason] NVARCHAR(191) NULL,
  [lines] NVARCHAR(MAX) NULL,
  [journalEntryId] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [PurchaseReturn_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PurchaseOrderLine] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [purchaseOrderId] INT NOT NULL,
  [itemId] INT NULL,
  [description] NVARCHAR(191) NULL,
  [quantity] DECIMAL(38, 18) DEFAULT (1) NOT NULL,
  [unitPrice] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [discount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [taxRate] DECIMAL(38, 18) DEFAULT (15) NOT NULL,
  [total] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  CONSTRAINT [PurchaseOrderLine_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PurchaseReceipt] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [purchaseOrderId] INT NULL,
  [supplierId] INT NULL,
  [warehouseId] INT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [notes] NVARCHAR(191) NULL,
  [lines] NVARCHAR(MAX) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [PurchaseReceipt_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Opportunity] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [title] NVARCHAR(191) NOT NULL,
  [customerId] INT NULL,
  [stage] NVARCHAR(191) DEFAULT ('LEAD') NOT NULL,
  [probability] INT DEFAULT (0) NOT NULL,
  [expectedCloseDate] DATETIME2(3) NULL,
  [value] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [ownerId] INT NULL,
  [notes] NVARCHAR(191) NULL,
  [status] NVARCHAR(191) DEFAULT ('OPEN') NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Opportunity_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SupportTicket] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [customerId] INT NULL,
  [subject] NVARCHAR(191) NOT NULL,
  [description] NVARCHAR(191) NULL,
  [priority] NVARCHAR(191) DEFAULT ('MEDIUM') NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('OPEN') NOT NULL,
  [assigneeId] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [SupportTicket_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SupportTicketMessage] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [ticketId] INT NOT NULL,
  [senderId] INT NULL,
  [senderType] NVARCHAR(191) NULL,
  [message] NVARCHAR(191) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [SupportTicketMessage_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [ProjectTask] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [projectId] INT NULL,
  [title] NVARCHAR(191) NOT NULL,
  [description] NVARCHAR(191) NULL,
  [assigneeId] INT NULL,
  [priority] NVARCHAR(191) DEFAULT ('MEDIUM') NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('TODO') NOT NULL,
  [progress] INT DEFAULT (0) NOT NULL,
  [startDate] DATETIME2(3) NULL,
  [endDate] DATETIME2(3) NULL,
  [estimatedHours] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [ProjectTask_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [ProjectExpense] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [projectId] INT NULL,
  [date] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [category] NVARCHAR(191) NULL,
  [description] NVARCHAR(191) NULL,
  [amount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [reference] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [ProjectExpense_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Employee] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [fullName] NVARCHAR(191) NOT NULL,
  [email] NVARCHAR(191) NULL,
  [phone] NVARCHAR(191) NULL,
  [department] NVARCHAR(191) NULL,
  [position] NVARCHAR(191) NULL,
  [hireDate] DATETIME2(3) NULL,
  [status] NVARCHAR(191) DEFAULT ('ACTIVE') NOT NULL,
  [baseSalary] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [allowances] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [bankAccountIban] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Employee_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [LeaveRequest] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [employeeId] INT NOT NULL,
  [type] NVARCHAR(191) NOT NULL,
  [startDate] DATETIME2(3) NOT NULL,
  [endDate] DATETIME2(3) NOT NULL,
  [daysCount] INT NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('PENDING') NOT NULL,
  [reason] NVARCHAR(191) NULL,
  [approvedBy] INT NULL,
  [approvedAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [LeaveRequest_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PayrollRun] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [year] INT NOT NULL,
  [month] INT NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [grossTotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [deductionTotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [netTotal] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [runDate] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [PayrollRun_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [PayrollLine] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [payrollRunId] INT NOT NULL,
  [employeeId] INT NOT NULL,
  [basicSalary] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [allowances] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [overtime] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [deductions] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [netSalary] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  CONSTRAINT [PayrollLine_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Contract] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [number] NVARCHAR(191) NOT NULL,
  [title] NVARCHAR(191) NOT NULL,
  [partyType] NVARCHAR(191) NOT NULL,
  [partyId] INT NULL,
  [type] NVARCHAR(191) NULL,
  [startDate] DATETIME2(3) NOT NULL,
  [endDate] DATETIME2(3) NULL,
  [value] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('DRAFT') NOT NULL,
  [terms] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Contract_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [ContractMilestone] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [contractId] INT NOT NULL,
  [title] NVARCHAR(191) NOT NULL,
  [dueDate] DATETIME2(3) NULL,
  [amount] DECIMAL(38, 18) DEFAULT (0) NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('PENDING') NOT NULL,
  [notes] NVARCHAR(191) NULL,
  CONSTRAINT [ContractMilestone_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Notification] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NULL,
  [title] NVARCHAR(191) NOT NULL,
  [message] NVARCHAR(191) NOT NULL,
  [type] NVARCHAR(191) DEFAULT ('INFO') NOT NULL,
  [isRead] BIT DEFAULT (0) NOT NULL,
  [readAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [Notification_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [UserTask] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NULL,
  [title] NVARCHAR(191) NOT NULL,
  [description] NVARCHAR(191) NULL,
  [dueDate] DATETIME2(3) NULL,
  [priority] NVARCHAR(191) DEFAULT ('MEDIUM') NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('OPEN') NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [UserTask_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [BackupJob] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [action] NVARCHAR(191) DEFAULT ('BACKUP') NOT NULL,
  [status] NVARCHAR(191) DEFAULT ('QUEUED') NOT NULL,
  [fileName] NVARCHAR(191) NULL,
  [fileSize] DECIMAL(38, 18) NULL,
  [storagePath] NVARCHAR(191) NULL,
  [isScheduled] BIT DEFAULT (0) NOT NULL,
  [scheduleExpr] NVARCHAR(191) NULL,
  [sourceBackupId] INT NULL,
  [requestedBy] INT NULL,
  [requestedAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [completedAt] DATETIME2(3) NULL,
  [notes] NVARCHAR(191) NULL,
  CONSTRAINT [BackupJob_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [IntegrationSetting] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [key] NVARCHAR(191) NOT NULL,
  [provider] NVARCHAR(191) NULL,
  [isEnabled] BIT DEFAULT (0) NOT NULL,
  [settings] NVARCHAR(MAX) NULL,
  [lastSyncAt] DATETIME2(3) NULL,
  [status] NVARCHAR(191) NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [IntegrationSetting_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [Currency] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [code] NVARCHAR(191) NOT NULL,
  [nameAr] NVARCHAR(191) NOT NULL,
  [symbol] NVARCHAR(191) NULL,
  [isBase] BIT DEFAULT (0) NOT NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [Currency_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [ExchangeRate] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [currencyCode] NVARCHAR(191) NOT NULL,
  [rateDate] DATETIME2(3) NOT NULL,
  [rate] DECIMAL(38, 18) NOT NULL,
  [source] NVARCHAR(191) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  CONSTRAINT [ExchangeRate_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [ScheduledReport] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [reportType] NVARCHAR(191) NOT NULL,
  [schedule] NVARCHAR(191) NOT NULL,
  [format] NVARCHAR(191) DEFAULT ('PDF') NOT NULL,
  [recipients] NVARCHAR(MAX) NULL,
  [isActive] BIT DEFAULT (1) NOT NULL,
  [lastRunAt] DATETIME2(3) NULL,
  [nextRunAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [ScheduledReport_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SavedReport] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [reportType] NVARCHAR(191) NOT NULL,
  [definition] NVARCHAR(MAX) NULL,
  [createdBy] INT NULL,
  [createdAt] DATETIME2(3) DEFAULT (SYSUTCDATETIME()) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [SavedReport_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [UserMfaSetting] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NOT NULL,
  [isEnabled] BIT DEFAULT (0) NOT NULL,
  [method] NVARCHAR(191) NULL,
  [secret] NVARCHAR(191) NULL,
  [backupCodes] NVARCHAR(MAX) NULL,
  [verifiedAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [UserMfaSetting_pkey] PRIMARY KEY ([id])
);
GO

CREATE TABLE [SecurityPolicy] (
  [id] INT DEFAULT (1) NOT NULL,
  [passwordMinLength] INT DEFAULT (8) NOT NULL,
  [passwordRequireComplex] BIT DEFAULT (1) NOT NULL,
  [passwordExpiryDays] INT DEFAULT (90) NOT NULL,
  [lockoutAttempts] INT DEFAULT (5) NOT NULL,
  [lockoutMinutes] INT DEFAULT (30) NOT NULL,
  [sessionTimeoutMinutes] INT DEFAULT (30) NOT NULL,
  [singleSessionOnly] BIT DEFAULT (0) NOT NULL,
  [auditReadActions] BIT DEFAULT (0) NOT NULL,
  [auditRetentionDays] INT DEFAULT (180) NOT NULL,
  [updatedAt] DATETIME2(3) NOT NULL,
  CONSTRAINT [SecurityPolicy_pkey] PRIMARY KEY ([id])
);
GO

CREATE UNIQUE INDEX [Role_name_key] ON [Role] ([name]);
GO
CREATE UNIQUE INDEX [User_username_key] ON [User] ([username]);
GO
CREATE UNIQUE INDEX [User_email_key] ON [User] ([email]);
GO
CREATE UNIQUE INDEX [AuthSession_refreshToken_key] ON [AuthSession] ([refreshToken]);
GO
CREATE INDEX [AuthSession_userId_idx] ON [AuthSession] ([userId]);
GO
CREATE UNIQUE INDEX [Account_code_key] ON [Account] ([code]);
GO
CREATE INDEX [AccountBalance_fiscalYear_period_idx] ON [AccountBalance] ([fiscalYear], [period]);
GO
CREATE UNIQUE INDEX [AccountBalance_accountId_fiscalYear_period_key] ON [AccountBalance] ([accountId], [fiscalYear], [period]);
GO
CREATE UNIQUE INDEX [FiscalYear_name_key] ON [FiscalYear] ([name]);
GO
CREATE INDEX [AccountingPeriod_startDate_endDate_idx] ON [AccountingPeriod] ([startDate], [endDate]);
GO
CREATE UNIQUE INDEX [AccountingPeriod_fiscalYearId_number_key] ON [AccountingPeriod] ([fiscalYearId], [number]);
GO
CREATE UNIQUE INDEX [JournalEntry_entryNumber_key] ON [JournalEntry] ([entryNumber]);
GO
CREATE INDEX [JournalEntry_date_status_idx] ON [JournalEntry] ([date], [status]);
GO
CREATE INDEX [JournalEntry_createdAt_idx] ON [JournalEntry] ([createdAt]);
GO
CREATE INDEX [JournalLine_accountId_idx] ON [JournalLine] ([accountId]);
GO
CREATE UNIQUE INDEX [JournalLine_entryId_lineNumber_key] ON [JournalLine] ([entryId], [lineNumber]);
GO
CREATE UNIQUE INDEX [Project_code_key] ON [Project] ([code]);
GO
CREATE UNIQUE INDEX [Department_code_key] ON [Department] ([code]);
GO
CREATE UNIQUE INDEX [CostCenter_code_key] ON [CostCenter] ([code]);
GO
CREATE UNIQUE INDEX [Customer_code_key] ON [Customer] ([code]);
GO
CREATE UNIQUE INDEX [Supplier_code_key] ON [Supplier] ([code]);
GO
CREATE INDEX [Contact_customerId_idx] ON [Contact] ([customerId]);
GO
CREATE INDEX [Contact_supplierId_idx] ON [Contact] ([supplierId]);
GO
CREATE UNIQUE INDEX [Invoice_number_key] ON [Invoice] ([number]);
GO
CREATE INDEX [Invoice_date_status_idx] ON [Invoice] ([date], [status]);
GO
CREATE INDEX [Invoice_createdAt_idx] ON [Invoice] ([createdAt]);
GO
CREATE UNIQUE INDEX [InvoiceLine_invoiceId_lineNumber_key] ON [InvoiceLine] ([invoiceId], [lineNumber]);
GO
CREATE UNIQUE INDEX [BankAccount_accountNumber_key] ON [BankAccount] ([accountNumber]);
GO
CREATE INDEX [BankTransaction_date_idx] ON [BankTransaction] ([date]);
GO
CREATE UNIQUE INDEX [Payment_number_key] ON [Payment] ([number]);
GO
CREATE INDEX [Payment_date_status_idx] ON [Payment] ([date], [status]);
GO
CREATE INDEX [Payment_createdAt_idx] ON [Payment] ([createdAt]);
GO
CREATE UNIQUE INDEX [PaymentAllocation_paymentId_invoiceId_key] ON [PaymentAllocation] ([paymentId], [invoiceId]);
GO
CREATE UNIQUE INDEX [AssetCategory_code_key] ON [AssetCategory] ([code]);
GO
CREATE UNIQUE INDEX [FixedAsset_code_key] ON [FixedAsset] ([code]);
GO
CREATE UNIQUE INDEX [DepreciationSchedule_assetId_fiscalYear_period_key] ON [DepreciationSchedule] ([assetId], [fiscalYear], [period]);
GO
CREATE UNIQUE INDEX [Budget_code_key] ON [Budget] ([code]);
GO
CREATE UNIQUE INDEX [BudgetLine_budgetId_accountId_period_key] ON [BudgetLine] ([budgetId], [accountId], [period]);
GO
CREATE UNIQUE INDEX [TaxCode_code_key] ON [TaxCode] ([code]);
GO
CREATE INDEX [AuditLog_table_recordId_idx] ON [AuditLog] ([table], [recordId]);
GO
CREATE INDEX [AuditLog_createdAt_idx] ON [AuditLog] ([createdAt]);
GO
CREATE UNIQUE INDEX [ItemCategory_code_key] ON [ItemCategory] ([code]);
GO
CREATE UNIQUE INDEX [Unit_code_key] ON [Unit] ([code]);
GO
CREATE UNIQUE INDEX [Item_code_key] ON [Item] ([code]);
GO
CREATE UNIQUE INDEX [Warehouse_code_key] ON [Warehouse] ([code]);
GO
CREATE UNIQUE INDEX [WarehouseLocation_warehouseId_code_key] ON [WarehouseLocation] ([warehouseId], [code]);
GO
CREATE UNIQUE INDEX [StockBalance_itemId_warehouseId_locationId_key] ON [StockBalance] ([itemId], [warehouseId], [locationId]);
GO
CREATE UNIQUE INDEX [StockCount_number_key] ON [StockCount] ([number]);
GO
CREATE UNIQUE INDEX [SalesQuote_number_key] ON [SalesQuote] ([number]);
GO
CREATE UNIQUE INDEX [SalesReturn_number_key] ON [SalesReturn] ([number]);
GO
CREATE UNIQUE INDEX [PurchaseOrder_number_key] ON [PurchaseOrder] ([number]);
GO
CREATE UNIQUE INDEX [PurchaseReturn_number_key] ON [PurchaseReturn] ([number]);
GO
CREATE UNIQUE INDEX [PurchaseReceipt_number_key] ON [PurchaseReceipt] ([number]);
GO
CREATE UNIQUE INDEX [SupportTicket_number_key] ON [SupportTicket] ([number]);
GO
CREATE UNIQUE INDEX [Employee_code_key] ON [Employee] ([code]);
GO
CREATE UNIQUE INDEX [Employee_email_key] ON [Employee] ([email]);
GO
CREATE UNIQUE INDEX [PayrollRun_code_key] ON [PayrollRun] ([code]);
GO
CREATE UNIQUE INDEX [Contract_number_key] ON [Contract] ([number]);
GO
CREATE UNIQUE INDEX [IntegrationSetting_key_key] ON [IntegrationSetting] ([key]);
GO
CREATE UNIQUE INDEX [Currency_code_key] ON [Currency] ([code]);
GO
CREATE UNIQUE INDEX [ExchangeRate_currencyCode_rateDate_key] ON [ExchangeRate] ([currencyCode], [rateDate]);
GO
CREATE UNIQUE INDEX [UserMfaSetting_userId_key] ON [UserMfaSetting] ([userId]);
GO

ALTER TABLE [SystemSettings] ADD CONSTRAINT [CK_SystemSettings_postingAccounts_JSON] CHECK (ISJSON([postingAccounts]) = 1);
GO
ALTER TABLE [Role] ADD CONSTRAINT [CK_Role_permissions_JSON] CHECK (ISJSON([permissions]) = 1);
GO
ALTER TABLE [Account] ADD CONSTRAINT [CK_Account_type_ENUM] CHECK ([type] IN (N'ASSET', N'LIABILITY', N'EQUITY', N'REVENUE', N'EXPENSE'));
GO
ALTER TABLE [FiscalYear] ADD CONSTRAINT [CK_FiscalYear_status_ENUM] CHECK ([status] IN (N'OPEN', N'CLOSED', N'ADJUSTING'));
GO
ALTER TABLE [AccountingPeriod] ADD CONSTRAINT [CK_AccountingPeriod_status_ENUM] CHECK ([status] IN (N'OPEN', N'CLOSED'));
GO
ALTER TABLE [JournalEntry] ADD CONSTRAINT [CK_JournalEntry_source_ENUM] CHECK ([source] IN (N'MANUAL', N'SALES', N'PURCHASE', N'PAYROLL', N'ASSETS', N'REVERSAL'));
GO
ALTER TABLE [JournalEntry] ADD CONSTRAINT [CK_JournalEntry_status_ENUM] CHECK ([status] IN (N'DRAFT', N'PENDING', N'POSTED', N'VOID', N'REVERSED'));
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [CK_Invoice_type_ENUM] CHECK ([type] IN (N'SALES', N'PURCHASE'));
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [CK_Invoice_status_ENUM] CHECK ([status] IN (N'DRAFT', N'ISSUED', N'PAID', N'PARTIAL', N'CANCELLED'));
GO
ALTER TABLE [Payment] ADD CONSTRAINT [CK_Payment_type_ENUM] CHECK ([type] IN (N'RECEIPT', N'PAYMENT'));
GO
ALTER TABLE [Payment] ADD CONSTRAINT [CK_Payment_method_ENUM] CHECK ([method] IN (N'CASH', N'BANK_TRANSFER', N'CHECK', N'CARD'));
GO
ALTER TABLE [Payment] ADD CONSTRAINT [CK_Payment_status_ENUM] CHECK ([status] IN (N'PENDING', N'COMPLETED', N'CANCELLED', N'BOUNCED'));
GO
ALTER TABLE [FixedAsset] ADD CONSTRAINT [CK_FixedAsset_status_ENUM] CHECK ([status] IN (N'ACTIVE', N'MAINTENANCE', N'SOLD', N'SCRAPPED'));
GO
ALTER TABLE [Budget] ADD CONSTRAINT [CK_Budget_status_ENUM] CHECK ([status] IN (N'DRAFT', N'ACTIVE', N'CLOSED'));
GO
ALTER TABLE [Budget] ADD CONSTRAINT [CK_Budget_controlLevel_ENUM] CHECK ([controlLevel] IN (N'NONE', N'WARNING', N'HARD'));
GO
ALTER TABLE [TaxCode] ADD CONSTRAINT [CK_TaxCode_type_ENUM] CHECK ([type] IN (N'VAT', N'WHT'));
GO
ALTER TABLE [TaxDeclaration] ADD CONSTRAINT [CK_TaxDeclaration_type_ENUM] CHECK ([type] IN (N'VAT', N'WHT'));
GO
ALTER TABLE [TaxDeclaration] ADD CONSTRAINT [CK_TaxDeclaration_status_ENUM] CHECK ([status] IN (N'DRAFT', N'FILED', N'PAID', N'CANCELLED'));
GO
ALTER TABLE [AuditLog] ADD CONSTRAINT [CK_AuditLog_oldValue_JSON] CHECK ([oldValue] IS NULL OR ISJSON([oldValue]) = 1);
GO
ALTER TABLE [AuditLog] ADD CONSTRAINT [CK_AuditLog_newValue_JSON] CHECK ([newValue] IS NULL OR ISJSON([newValue]) = 1);
GO
ALTER TABLE [SalesQuote] ADD CONSTRAINT [CK_SalesQuote_lines_JSON] CHECK ([lines] IS NULL OR ISJSON([lines]) = 1);
GO
ALTER TABLE [SalesReturn] ADD CONSTRAINT [CK_SalesReturn_lines_JSON] CHECK ([lines] IS NULL OR ISJSON([lines]) = 1);
GO
ALTER TABLE [PurchaseReturn] ADD CONSTRAINT [CK_PurchaseReturn_lines_JSON] CHECK ([lines] IS NULL OR ISJSON([lines]) = 1);
GO
ALTER TABLE [PurchaseReceipt] ADD CONSTRAINT [CK_PurchaseReceipt_lines_JSON] CHECK ([lines] IS NULL OR ISJSON([lines]) = 1);
GO
ALTER TABLE [IntegrationSetting] ADD CONSTRAINT [CK_IntegrationSetting_settings_JSON] CHECK ([settings] IS NULL OR ISJSON([settings]) = 1);
GO
ALTER TABLE [ScheduledReport] ADD CONSTRAINT [CK_ScheduledReport_recipients_JSON] CHECK ([recipients] IS NULL OR ISJSON([recipients]) = 1);
GO
ALTER TABLE [SavedReport] ADD CONSTRAINT [CK_SavedReport_definition_JSON] CHECK ([definition] IS NULL OR ISJSON([definition]) = 1);
GO
ALTER TABLE [UserMfaSetting] ADD CONSTRAINT [CK_UserMfaSetting_backupCodes_JSON] CHECK ([backupCodes] IS NULL OR ISJSON([backupCodes]) = 1);
GO

ALTER TABLE [User] ADD CONSTRAINT [User_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [Role] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
ALTER TABLE [AuthSession] ADD CONSTRAINT [AuthSession_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [User] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [Account] ADD CONSTRAINT [Account_parentId_fkey] FOREIGN KEY ([parentId]) REFERENCES [Account] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [AccountBalance] ADD CONSTRAINT [AccountBalance_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [Account] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [AccountingPeriod] ADD CONSTRAINT [AccountingPeriod_fiscalYearId_fkey] FOREIGN KEY ([fiscalYearId]) REFERENCES [FiscalYear] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalEntry] ADD CONSTRAINT [JournalEntry_periodId_fkey] FOREIGN KEY ([periodId]) REFERENCES [AccountingPeriod] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalEntry] ADD CONSTRAINT [JournalEntry_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalEntry] ADD CONSTRAINT [JournalEntry_postedById_fkey] FOREIGN KEY ([postedById]) REFERENCES [User] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalLine] ADD CONSTRAINT [JournalLine_entryId_fkey] FOREIGN KEY ([entryId]) REFERENCES [JournalEntry] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalLine] ADD CONSTRAINT [JournalLine_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [Account] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalLine] ADD CONSTRAINT [JournalLine_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [Project] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalLine] ADD CONSTRAINT [JournalLine_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [Department] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [JournalLine] ADD CONSTRAINT [JournalLine_costCenterId_fkey] FOREIGN KEY ([costCenterId]) REFERENCES [CostCenter] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Department] ADD CONSTRAINT [Department_parentId_fkey] FOREIGN KEY ([parentId]) REFERENCES [Department] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Contact] ADD CONSTRAINT [Contact_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [Customer] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [Contact] ADD CONSTRAINT [Contact_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [Supplier] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [Invoice_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [Customer] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [Invoice_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [Supplier] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [Invoice_projectId_fkey] FOREIGN KEY ([projectId]) REFERENCES [Project] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [Invoice_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [User] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Invoice] ADD CONSTRAINT [Invoice_journalEntryId_fkey] FOREIGN KEY ([journalEntryId]) REFERENCES [JournalEntry] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [InvoiceLine] ADD CONSTRAINT [InvoiceLine_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [Invoice] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [BankAccount] ADD CONSTRAINT [BankAccount_glAccountId_fkey] FOREIGN KEY ([glAccountId]) REFERENCES [Account] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [BankTransaction] ADD CONSTRAINT [BankTransaction_bankId_fkey] FOREIGN KEY ([bankId]) REFERENCES [BankAccount] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [BankTransaction] ADD CONSTRAINT [BankTransaction_journalEntryId_fkey] FOREIGN KEY ([journalEntryId]) REFERENCES [JournalEntry] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Payment] ADD CONSTRAINT [Payment_bankId_fkey] FOREIGN KEY ([bankId]) REFERENCES [BankAccount] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Payment] ADD CONSTRAINT [Payment_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [Customer] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Payment] ADD CONSTRAINT [Payment_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [Supplier] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Payment] ADD CONSTRAINT [Payment_journalEntryId_fkey] FOREIGN KEY ([journalEntryId]) REFERENCES [JournalEntry] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Payment] ADD CONSTRAINT [Payment_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [User] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [PaymentAllocation] ADD CONSTRAINT [PaymentAllocation_paymentId_fkey] FOREIGN KEY ([paymentId]) REFERENCES [Payment] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [PaymentAllocation] ADD CONSTRAINT [PaymentAllocation_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [Invoice] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [FixedAsset] ADD CONSTRAINT [FixedAsset_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [AssetCategory] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
ALTER TABLE [DepreciationSchedule] ADD CONSTRAINT [DepreciationSchedule_assetId_fkey] FOREIGN KEY ([assetId]) REFERENCES [FixedAsset] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [DepreciationSchedule] ADD CONSTRAINT [DepreciationSchedule_journalEntryId_fkey] FOREIGN KEY ([journalEntryId]) REFERENCES [JournalEntry] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [BudgetLine] ADD CONSTRAINT [BudgetLine_budgetId_fkey] FOREIGN KEY ([budgetId]) REFERENCES [Budget] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
GO
ALTER TABLE [BudgetLine] ADD CONSTRAINT [BudgetLine_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [Account] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
ALTER TABLE [AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [User] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Item] ADD CONSTRAINT [Item_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [ItemCategory] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
ALTER TABLE [Item] ADD CONSTRAINT [Item_unitId_fkey] FOREIGN KEY ([unitId]) REFERENCES [Unit] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
GO
