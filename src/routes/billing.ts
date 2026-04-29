import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireBillingEditor = requireRole('SUPERADMIN', 'MANAGER');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const franchiseId = req.query.franchiseId as string | undefined;
    const where = franchiseId ? { franchiseId } : {};
    const data = await prisma.billingData.findMany({
      where,
      include: { franchise: { select: { id: true, name: true, zoneId: true } } },
      orderBy: [{ franchiseId: 'asc' }, { periodo: 'asc' }],
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error al obtener facturación' });
  }
});

router.post('/', authenticate, requireBillingEditor, async (req: Request, res: Response) => {
  try {
    const { franchiseId, periodo, ventasBrutas, transacciones, ticketPromedio, notas } = req.body || {};
    if (!franchiseId || !periodo) {
      res.status(400).json({ error: 'franchiseId y periodo requeridos' });
      return;
    }
    const created = await prisma.billingData.upsert({
      where: { franchiseId_periodo: { franchiseId, periodo } },
      create: {
        franchiseId,
        periodo,
        ventasBrutas: Number(ventasBrutas) || 0,
        transacciones: Number(transacciones) || 0,
        ticketPromedio: Number(ticketPromedio) || 0,
        notas: notas || '',
      },
      update: {
        ventasBrutas: Number(ventasBrutas) || 0,
        transacciones: Number(transacciones) || 0,
        ticketPromedio: Number(ticketPromedio) || 0,
        notas: notas || '',
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Error al guardar facturación' });
  }
});

router.delete('/:id', authenticate, requireBillingEditor, async (req: Request, res: Response) => {
  try {
    await prisma.billingData.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar registro' });
  }
});

router.post('/upload', authenticate, requireBillingEditor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const franchiseId = (req.body?.franchiseId || '').trim();
    if (!franchiseId) {
      res.status(400).json({ error: 'franchiseId requerido' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Archivo CSV requerido' });
      return;
    }
    const csv = req.file.buffer.toString('utf-8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) {
      res.status(400).json({ error: `Error parseando CSV: ${parsed.errors[0].message}` });
      return;
    }
    const rows = parsed.data;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      const periodo = (row.periodo || row.mes || row.fecha || '').trim();
      if (!periodo) {
        skipped++;
        continue;
      }
      const ventasBrutas = Number(row.ventas || row.ventasBrutas || row.facturacion || 0) || 0;
      const transacciones = Number(row.transacciones || row.tickets || 0) || 0;
      const ticketPromedio =
        Number(row.ticketPromedio || row.ticket || 0) ||
        (transacciones > 0 ? ventasBrutas / transacciones : 0);
      const notas = (row.notas || row.observaciones || '').trim();
      const existing = await prisma.billingData.findUnique({
        where: { franchiseId_periodo: { franchiseId, periodo } },
      });
      await prisma.billingData.upsert({
        where: { franchiseId_periodo: { franchiseId, periodo } },
        create: { franchiseId, periodo, ventasBrutas, transacciones, ticketPromedio, notas },
        update: { ventasBrutas, transacciones, ticketPromedio, notas },
      });
      if (existing) updated++;
      else created++;
    }
    res.json({ created, updated, skipped, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al procesar CSV' });
  }
});

export default router;
