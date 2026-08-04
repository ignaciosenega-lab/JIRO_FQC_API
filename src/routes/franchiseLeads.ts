import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// ─── POST /api/franchise-leads ─────────────────────────
// Público (landing) o admin (carga manual). El origen se determina así:
//   - request sin Authorization → landing.
//   - request con Authorization → default manual, pero se puede overridear en el body.
router.post('/', async (req: Request, res: Response) => {
  try {
    const { nombre, email, telefono, ciudad, mensaje, notas } = req.body || {};
    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      res.status(400).json({ error: 'El nombre es obligatorio' });
      return;
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'El email es obligatorio' });
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }
    if (nombre.length > 200 || email.length > 200 || (mensaje?.length || 0) > 5000) {
      res.status(400).json({ error: 'Campos demasiado largos' });
      return;
    }
    const hasAuth = !!req.headers.authorization;
    const requested = typeof req.body?.origen === 'string' ? req.body.origen.toLowerCase() : null;
    const ALLOWED_ORIGINS = ['landing', 'manual'];
    let origen: string;
    if (requested && ALLOWED_ORIGINS.includes(requested)) {
      // Solo respetamos el override si viene desde un cliente autenticado.
      origen = hasAuth ? requested : 'landing';
    } else {
      origen = hasAuth ? 'manual' : 'landing';
    }
    const lead = await prisma.franchiseLead.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        telefono: (telefono || '').toString().trim(),
        ciudad: (ciudad || '').toString().trim(),
        mensaje: (mensaje || '').toString().trim(),
        notas: (notas || '').toString().trim(),
        origen,
      },
    });
    res.status(201).json({ success: true, id: lead.id });
  } catch {
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});

// ─── ADMIN ─────────────────────────────────────────────
const requireLeadEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

// GET /api/franchise-leads  — lista completa (más nuevos primero).
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const leads = await prisma.franchiseLead.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(leads);
  } catch {
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// PATCH /api/franchise-leads/:id  — actualiza estado / notas.
router.patch('/:id', authenticate, requireLeadEditor, async (req: Request, res: Response) => {
  try {
    const { estado, notas } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof estado === 'string') data.estado = estado;
    if (typeof notas === 'string') data.notas = notas;
    const lead = await prisma.franchiseLead.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(lead);
  } catch {
    res.status(500).json({ error: 'Error al actualizar lead' });
  }
});

// DELETE /api/franchise-leads/:id
router.delete('/:id', authenticate, requireLeadEditor, async (req: Request, res: Response) => {
  try {
    await prisma.franchiseLead.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar lead' });
  }
});

export default router;
