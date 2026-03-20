import { Router } from 'express';
import suppliersRoutes from '../suppliers/route';
import purchaseOrdersRoutes from '../purchase-orders/route';
import purchaseReturnsRoutes from '../purchase-returns/route';
import invoiceRoutes from '../invoices/route';
import paymentRoutes from '../payments/route';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('procurement'));
router.use('/suppliers', suppliersRoutes);
router.use('/purchase-orders', purchaseOrdersRoutes);
router.use('/purchase-returns', purchaseReturnsRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);

export default router;
