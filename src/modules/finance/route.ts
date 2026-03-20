import { Router } from 'express';
import accountRoutes from '../accounts/route';
import journalRoutes from '../journals/route';
import fiscalYearsRoutes from '../fiscal-years/route';
import periodsRoutes from '../periods/route';
import invoiceRoutes from '../invoices/route';
import paymentRoutes from '../payments/route';
import bankRoutes from '../banks/route';
import bankTransactionsRoutes from '../bank-transactions/route';
import budgetRoutes from '../budgets/route';
import taxRoutes from '../taxes/route';
import taxCodesRoutes from '../tax-codes/route';
import taxDeclarationsRoutes from '../tax-declarations/route';
import reportRoutes from '../reports/route';
import yearCloseRoutes from '../year-close/route';
import { forwardSubtree } from '../shared/route-forward';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('accounting'));
router.use('/accounts', accountRoutes);
router.use('/journals', journalRoutes);
router.use('/fiscal-years', fiscalYearsRoutes);
router.use('/periods', periodsRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/banks', bankRoutes);
router.use('/bank-transactions', bankTransactionsRoutes);
router.use('/budgets', budgetRoutes);
router.use('/taxes', taxRoutes);
router.use('/tax-codes', taxCodesRoutes);
router.use('/tax-declarations', taxDeclarationsRoutes);
router.use('/reports', reportRoutes);
router.use('/year-close', forwardSubtree('/year-close', yearCloseRoutes));

export default router;
