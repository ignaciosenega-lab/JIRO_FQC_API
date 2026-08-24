import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Roles con visibilidad completa (ven todos los leads, no solo los propios).
const ADMIN_ROLES = new Set(['SUPERADMIN', 'MANAGER']);
const requireLeadEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES', 'VENDEDOR');
const requireLeadAdmin = requireRole('SUPERADMIN', 'MANAGER');

// ── Reparto ponderado ──────────────────────────────────────
// Devuelve el userId al que le corresponde el próximo lead, o null si no hay
// vendedores marcados como "receivesLeads". Algoritmo: al que tenga mayor
// "déficit" según su peso relativo.
//
//   déficit(v) = peso(v) / sumaPesos * totalLeads − leadsActuales(v)
//
// El que tenga mayor déficit se lleva el próximo (le "faltan" leads según
// su cuota). En empate, gana el que menos leads tiene absolutos.
async function pickNextAssignee(): Promise<string | null> {
  const sellers = await prisma.user.findMany({
    where: { receivesLeads: true, active: true },
    select: { id: true, leadWeight: true },
  });
  if (sellers.length === 0) return null;

  // Contamos leads ya asignados por cada seller.
  const counts = await prisma.franchiseLead.groupBy({
    by: ['assignedToId'],
    where: { assignedToId: { in: sellers.map((s) => s.id) } },
    _count: { _all: true },
  });
  const countBy = new Map(counts.map((c) => [c.assignedToId!, c._count._all]));
  const totalWeight = sellers.reduce((s, v) => s + Math.max(v.leadWeight, 1), 0);
  const totalLeads = counts.reduce((s, v) => s + v._count._all, 0);

  let best: { id: string; deficit: number; count: number } | null = null;
  for (const s of sellers) {
    const w = Math.max(s.leadWeight, 1);
    const share = (w / totalWeight) * totalLeads;
    const current = countBy.get(s.id) || 0;
    const deficit = share - current + w / totalWeight; // el +w/totalWeight rompe empates a favor del más pesado
    if (!best || deficit > best.deficit || (deficit === best.deficit && current < best.count)) {
      best = { id: s.id, deficit, count: current };
    }
  }
  return best?.id || null;
}

// ─── POST /api/franchise-leads ─────────────────────────
// Público (landing) o admin (carga manual). Al crear, asignamos con el
// algoritmo ponderado; si viene assignedToId en el body Y el request está
// autenticado por un admin, se respeta.
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
      origen = hasAuth ? requested : 'landing';
    } else {
      origen = hasAuth ? 'manual' : 'landing';
    }

    // Asignación: por default reparto ponderado. Un admin puede overridear
    // pasando assignedToId en el body (para carga manual dirigida).
    let assignedToId: string | null = null;
    if (hasAuth && typeof req.body?.assignedToId === 'string' && req.body.assignedToId.trim()) {
      assignedToId = req.body.assignedToId.trim();
    } else {
      assignedToId = await pickNextAssignee();
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
        assignedToId,
      },
    });
    res.status(201).json({ success: true, id: lead.id, assignedToId });
  } catch (err) {
    console.error('[franchise-leads] POST error:', err);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});

// GET /api/franchise-leads
// Regla de visibilidad:
// - Si el user tiene receivesLeads=true → actúa como vendedor, solo ve los suyos
//   (aunque su rol global sea MANAGER o SUPERADMIN).
// - Si NO tiene receivesLeads y es SUPERADMIN/MANAGER → ve todos los leads.
// - Si NO tiene receivesLeads y es otro rol → solo los suyos.
// Query params: ?assignedToId=<id|me|none|all> — admin puro puede overridear.
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { receivesLeads: true },
    });
    const isPureAdmin = ADMIN_ROLES.has(req.userRole || '') && !me?.receivesLeads;
    const where: Record<string, unknown> = {};

    // Filtro explícito por query string (solo admin puro puede filtrar por otro).
    const q = typeof req.query.assignedToId === 'string' ? req.query.assignedToId : '';
    if (q === 'me') {
      where.assignedToId = req.userId!;
    } else if (q === 'none') {
      if (!isPureAdmin) { res.status(403).json({ error: 'Solo admin' }); return; }
      where.assignedToId = null;
    } else if (q && q !== 'all') {
      if (!isPureAdmin && q !== req.userId) { res.status(403).json({ error: 'Solo podés ver tus propios leads' }); return; }
      where.assignedToId = q;
    } else if (!isPureAdmin) {
      // Sin query explícito: se ven solo los propios (vendedores + admins que también reciben leads).
      where.assignedToId = req.userId!;
    }

    const leads = await prisma.franchiseLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });
    res.json(leads);
  } catch (err) {
    console.error('[franchise-leads] GET error:', err);
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// PATCH /api/franchise-leads/:id
// - No-admin: solo puede editar sus propios leads (estado / notas). No puede reasignar.
// - Admin: puede editar cualquiera, incluyendo assignedToId (reasignar).
router.patch('/:id', authenticate, requireLeadEditor, async (req: AuthRequest, res: Response) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { receivesLeads: true },
    });
    const isPureAdmin = ADMIN_ROLES.has(req.userRole || '') && !me?.receivesLeads;
    const existing = await prisma.franchiseLead.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Lead no encontrado' }); return; }
    if (!isPureAdmin && existing.assignedToId !== req.userId) {
      res.status(403).json({ error: 'Solo podés editar tus propios leads' });
      return;
    }

    const { estado, notas, assignedToId } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof estado === 'string') data.estado = estado;
    if (typeof notas === 'string') data.notas = notas;
    if (isPureAdmin && assignedToId !== undefined) {
      // Solo admin puro puede reasignar. null = dejar sin asignar.
      data.assignedToId = assignedToId === null || assignedToId === '' ? null : String(assignedToId);
    }
    const lead = await prisma.franchiseLead.update({
      where: { id: req.params.id as string },
      data,
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });
    res.json(lead);
  } catch (err) {
    console.error('[franchise-leads] PATCH error:', err);
    res.status(500).json({ error: 'Error al actualizar lead' });
  }
});

// POST /api/franchise-leads/bulk-assign
// Asigna en masa. Body: { toUserId: string, onlyUnassigned?: boolean }.
// Solo admin. Útil para asignar los leads existentes a un vendedor específico.
router.post('/bulk-assign', authenticate, requireLeadAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { toUserId, onlyUnassigned } = req.body || {};
    if (!toUserId || typeof toUserId !== 'string') {
      res.status(400).json({ error: 'toUserId es obligatorio' });
      return;
    }
    const targetUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!targetUser) { res.status(400).json({ error: 'Usuario no existe' }); return; }
    const where: Record<string, unknown> = {};
    if (onlyUnassigned !== false) where.assignedToId = null; // por default solo los no asignados
    const result = await prisma.franchiseLead.updateMany({ where, data: { assignedToId: toUserId } });
    res.json({ updated: result.count });
  } catch (err) {
    console.error('[franchise-leads] bulk-assign error:', err);
    res.status(500).json({ error: 'Error en bulk-assign' });
  }
});

// DELETE /api/franchise-leads/:id — admin only para no borrar leads ajenos.
router.delete('/:id', authenticate, requireLeadAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.franchiseLead.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (err) {
    console.error('[franchise-leads] DELETE error:', err);
    res.status(500).json({ error: 'Error al eliminar lead' });
  }
});

export default router;
