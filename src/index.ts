import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import manualItemsRoutes from './routes/manualItems';
import manualPdfRoutes from './routes/manualPdf';
import ticketsRoutes from './routes/tickets';
import visitsRoutes from './routes/visits';
import franchisesRoutes from './routes/franchises';
import usersRoutes from './routes/users';
import onoRoutes from './routes/ono';
import auditsRoutes from './routes/audits';
import auditsConfigRoutes from './routes/auditsConfig';
import rolePermissionsRoutes from './routes/rolePermissions';
import zonesRoutes from './routes/zones';
import billingRoutes from './routes/billing';
import royaltiesRoutes from './routes/royalties';
import adsRoutes from './routes/ads';
import employeesRoutes from './routes/employees';
import salariesRoutes from './routes/salaries';
import otherExpensesRoutes from './routes/otherExpenses';
import marketingRoutes from './routes/marketing';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/manual-items', manualItemsRoutes);
app.use('/api/manual-pdf', manualPdfRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/visits', visitsRoutes);
app.use('/api/franchises', franchisesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/ono', onoRoutes);
app.use('/api/audits', auditsRoutes);
app.use('/api/audits-config', auditsConfigRoutes);
app.use('/api/role-permissions', rolePermissionsRoutes);
app.use('/api/zones', zonesRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/royalties', royaltiesRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/salaries', salariesRoutes);
app.use('/api/other-expenses', otherExpensesRoutes);
app.use('/api/marketing', marketingRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 JIRO FQC API running on port ${PORT}`);
});
