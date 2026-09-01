import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import { authenticate, requireRole, requireSuperadmin, AuthRequest } from '../middleware/auth';

const router = Router();

// SUPERADMIN, MANAGER y OPERACIONES pueden crear/editar aperturas y tareas.
const requireOpeningsEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

const VALID_ESTADOS = new Set(['pendiente', 'en_proceso', 'completada', 'bloqueada']);
const VALID_STATUS = new Set(['en_curso', 'abierta', 'cancelada']);

// ── Helpers ────────────────────────────────────────────────
function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// El template trae nombres sugeridos ("Yosue", "Luis", "Ignacio", "Nacho",
// "Leandro", "Franquiciado", "Yosue y Lean", "Luis / Diana"). Los resolvemos a
// un User real de la DB por primera coincidencia sub-string case-insensitive.
// "Franquiciado" es un rol genérico y no matchea con nadie por default —
// devuelve null. Si el sugerido combina varias personas ("Yosue y Lean"),
// tomamos la primera; los alias como "Nacho"→"Ignacio" y "Lean"→"Leandro"
// se resuelven vía la lista de sinónimos.
const NAME_ALIASES: Record<string, string[]> = {
  nacho: ['ignacio', 'nacho'],
  ignacio: ['ignacio', 'nacho'],
  lean: ['leandro', 'lean'],
  leandro: ['leandro', 'lean'],
};

export function resolveSuggestedAssignee(
  sugerido: string | null | undefined,
  users: Array<{ id: string; name: string }>
): string | null {
  if (!sugerido) return null;
  // Nos quedamos con la primera persona: "Yosue y Lean" → "Yosue".
  const firstName = sugerido.split(/\s+y\s+|\s*\/\s*|\s*,\s*|\s+&\s+/i)[0]?.trim().toLowerCase();
  if (!firstName) return null;
  if (firstName === 'franquiciado') return null; // rol genérico, no un user
  const candidates = NAME_ALIASES[firstName] || [firstName];
  for (const cand of candidates) {
    const match = users.find((u) => (u.name || '').toLowerCase().includes(cand));
    if (match) return match.id;
  }
  return null;
}

// ── GET /api/openings ──────────────────────────────────────
// Lista aperturas con conteos de progreso. Por default solo las 'en_curso'.
// ?status=all|en_curso|abierta|cancelada
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'en_curso';
    const where = rawStatus === 'all' ? {} : { status: rawStatus };

    const openings = await prisma.opening.findMany({
      where,
      orderBy: [{ status: 'asc' }, { fechaObjetivoApertura: 'asc' }, { createdAt: 'desc' }],
      include: {
        respOperaciones: { select: { id: true, name: true } },
        respMarketing: { select: { id: true, name: true } },
      },
    });

    // Traer los conteos de tareas en un solo groupBy para no hacer N+1.
    const ids = openings.map((o) => o.id);
    const grouped = ids.length
      ? await prisma.openingTask.groupBy({
          by: ['openingId', 'mode', 'estado'],
          where: { openingId: { in: ids } },
          _count: { _all: true },
        })
      : [];

    const stats = new Map<string, { checklistTotal: number; checklistDone: number; marketingTotal: number; marketingDone: number }>();
    for (const id of ids) {
      stats.set(id, { checklistTotal: 0, checklistDone: 0, marketingTotal: 0, marketingDone: 0 });
    }
    for (const g of grouped) {
      const s = stats.get(g.openingId)!;
      const total = g._count._all;
      if (g.mode === 'checklist') {
        s.checklistTotal += total;
        if (g.estado === 'completada') s.checklistDone += total;
      } else if (g.mode === 'marketing') {
        s.marketingTotal += total;
        if (g.estado === 'completada') s.marketingDone += total;
      }
    }

    const result = openings.map((o) => {
      const s = stats.get(o.id)!;
      const pct = s.checklistTotal ? Math.round((s.checklistDone / s.checklistTotal) * 100) : 0;
      return { ...o, stats: { ...s, checklistPct: pct } };
    });

    res.json(result);
  } catch (err) {
    console.error('[openings] GET / error:', err);
    res.status(500).json({ error: 'Error al listar aperturas' });
  }
});

// ── GET /api/openings/:id ──────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const opening = await prisma.opening.findUnique({
      where: { id: req.params.id as string },
      include: {
        respOperaciones: { select: { id: true, name: true } },
        respMarketing: { select: { id: true, name: true } },
        tasks: {
          orderBy: [{ mode: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
          include: { assignedTo: { select: { id: true, name: true } } },
        },
      },
    });
    if (!opening) {
      res.status(404).json({ error: 'Apertura no encontrada' });
      return;
    }
    res.json(opening);
  } catch (err) {
    console.error('[openings] GET /:id error:', err);
    res.status(500).json({ error: 'Error al obtener apertura' });
  }
});

// ── POST /api/openings ─────────────────────────────────────
// Crea una apertura. Al crear, popula todas las tareas del template activo.
router.post('/', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.localName || typeof b.localName !== 'string' || !b.localName.trim()) {
      res.status(400).json({ error: 'localName es obligatorio' });
      return;
    }

    const [templates, users] = await Promise.all([
      prisma.openingTaskTemplate.findMany({
        where: { active: true },
        orderBy: [{ mode: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
      }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    ]);

    const opening = await prisma.$transaction(async (tx) => {
      const created = await tx.opening.create({
        data: {
          localName: b.localName.trim(),
          zona: (b.zona || '').toString().trim(),
          franquiciado: (b.franquiciado || '').toString().trim(),
          respOperacionesId: b.respOperacionesId || null,
          respMarketingId: b.respMarketingId || null,
          fechaObjetivoApertura: parseDate(b.fechaObjetivoApertura) ?? null,
          notas: (b.notas || '').toString(),
        },
      });
      if (templates.length > 0) {
        await tx.openingTask.createMany({
          data: templates.map((t) => ({
            openingId: created.id,
            templateId: t.id,
            templateTitulo: t.tarea,
            categoria: t.categoria,
            semana: t.semana,
            grupo: t.grupo,
            tipo: t.tipo,
            mode: t.mode,
            orden: t.orden,
            diasEstimados: t.diasEstimados,
            notas: t.notas,
            assignedToId: resolveSuggestedAssignee(t.responsableSugerido, users),
          })),
        });
      }
      return created;
    });

    res.status(201).json({ success: true, id: opening.id });
  } catch (err) {
    console.error('[openings] POST error:', err);
    res.status(500).json({ error: 'Error al crear apertura' });
  }
});

// ── PATCH /api/openings/:id ────────────────────────────────
router.patch('/:id', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof b.localName === 'string' && b.localName.trim()) data.localName = b.localName.trim();
    if (typeof b.zona === 'string') data.zona = b.zona;
    if (typeof b.franquiciado === 'string') data.franquiciado = b.franquiciado;
    if (b.respOperacionesId !== undefined) data.respOperacionesId = b.respOperacionesId || null;
    if (b.respMarketingId !== undefined) data.respMarketingId = b.respMarketingId || null;
    if (b.fechaObjetivoApertura !== undefined) {
      const parsed = parseDate(b.fechaObjetivoApertura);
      if (parsed !== undefined) data.fechaObjetivoApertura = parsed;
    }
    if (typeof b.notas === 'string') data.notas = b.notas;
    if (typeof b.status === 'string' && VALID_STATUS.has(b.status)) data.status = b.status;

    const updated = await prisma.opening.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(updated);
  } catch (err) {
    console.error('[openings] PATCH error:', err);
    res.status(500).json({ error: 'Error al actualizar apertura' });
  }
});

// ── DELETE /api/openings/:id ───────────────────────────────
router.delete('/:id', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.opening.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (err) {
    console.error('[openings] DELETE error:', err);
    res.status(500).json({ error: 'Error al eliminar apertura' });
  }
});

// ── PATCH /api/openings/:id/tasks/:taskId ──────────────────
router.patch('/:id/tasks/:taskId', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof b.estado === 'string') {
      if (!VALID_ESTADOS.has(b.estado)) {
        res.status(400).json({ error: 'Estado inválido' });
        return;
      }
      data.estado = b.estado;
      data.fechaCompletada = b.estado === 'completada' ? new Date() : null;
    }
    if (b.fechaInicio !== undefined) {
      const parsed = parseDate(b.fechaInicio);
      if (parsed !== undefined) data.fechaInicio = parsed;
    }
    if (typeof b.notas === 'string') data.notas = b.notas;
    if (b.assignedToId !== undefined) data.assignedToId = b.assignedToId || null;
    if (typeof b.diasEstimados === 'number' || b.diasEstimados === null) data.diasEstimados = b.diasEstimados;

    const task = await prisma.openingTask.update({
      where: { id: req.params.taskId as string },
      data,
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    if (task.openingId !== req.params.id) {
      res.status(400).json({ error: 'La tarea no pertenece a esa apertura' });
      return;
    }
    res.json(task);
  } catch (err) {
    console.error('[openings] PATCH task error:', err);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// ── POST /api/openings/:id/tasks ───────────────────────────
// Agrega una tarea manual (fuera del template) a una apertura.
router.post('/:id/tasks', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.templateTitulo || typeof b.templateTitulo !== 'string') {
      res.status(400).json({ error: 'templateTitulo es obligatorio' });
      return;
    }
    const mode = b.mode === 'marketing' ? 'marketing' : 'checklist';
    const task = await prisma.openingTask.create({
      data: {
        openingId: req.params.id as string,
        templateId: `custom-${Date.now()}`,
        templateTitulo: b.templateTitulo.trim(),
        categoria: b.categoria || null,
        semana: b.semana || null,
        grupo: (b.grupo || 'CUSTOM').toString(),
        tipo: mode === 'marketing' ? 'accion' : (b.tipo === 'principal' ? 'principal' : 'subtarea'),
        mode,
        orden: typeof b.orden === 'number' ? b.orden : 999,
        diasEstimados: typeof b.diasEstimados === 'number' ? b.diasEstimados : null,
        notas: b.notas || '',
        assignedToId: b.assignedToId || null,
      },
    });
    res.status(201).json(task);
  } catch (err) {
    console.error('[openings] POST task error:', err);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// ── DELETE /api/openings/:id/tasks/:taskId ─────────────────
router.delete('/:id/tasks/:taskId', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.openingTask.delete({ where: { id: req.params.taskId as string } });
    res.json({ success: true });
  } catch (err) {
    console.error('[openings] DELETE task error:', err);
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

// ── POST /api/openings/:id/auto-assign-suggested ───────────
// Recorre las tareas de una apertura y, para las que NO tienen assignedTo,
// resuelve el responsableSugerido del template a un User real y lo asigna.
router.post('/:id/auto-assign-suggested', authenticate, requireOpeningsEditor, async (req: AuthRequest, res: Response) => {
  try {
    const openingId = req.params.id as string;
    const opening = await prisma.opening.findUnique({ where: { id: openingId }, select: { id: true } });
    if (!opening) { res.status(404).json({ error: 'Apertura no encontrada' }); return; }

    const [tasks, templates, users] = await Promise.all([
      prisma.openingTask.findMany({
        where: { openingId, assignedToId: null },
        select: { id: true, templateId: true },
      }),
      prisma.openingTaskTemplate.findMany({ select: { id: true, responsableSugerido: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    ]);

    const suggestedById = new Map(templates.map((t) => [t.id, t.responsableSugerido]));

    // Agrupamos actualizaciones por userId para minimizar queries.
    const byUser = new Map<string, string[]>();
    for (const t of tasks) {
      const uid = resolveSuggestedAssignee(suggestedById.get(t.templateId), users);
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(t.id);
    }

    let assigned = 0;
    for (const [uid, ids] of byUser.entries()) {
      const r = await prisma.openingTask.updateMany({
        where: { id: { in: ids } },
        data: { assignedToId: uid },
      });
      assigned += r.count;
    }

    res.json({ assigned, unmatched: tasks.length - assigned });
  } catch (err) {
    console.error('[openings] auto-assign-suggested error:', err);
    res.status(500).json({ error: 'Error al asignar responsables sugeridos' });
  }
});

// ── POST /api/openings/import-current ──────────────────────
// Importa los locales iniciales del HTML/Google Sheet. Idempotente:
// no crea de nuevo un local ya existente.
router.post('/import-current', authenticate, requireSuperadmin, async (_req: AuthRequest, res: Response) => {
  try {
    const initialPath = path.resolve(__dirname, '..', '..', 'scripts', 'data', 'openings-initial.json');
    if (!fs.existsSync(initialPath)) {
      res.status(500).json({ error: 'openings-initial.json no encontrado en el servidor' });
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(initialPath, 'utf8')) as {
      locations: Array<{
        localName: string; zona: string; franquiciado: string;
        respOperacionesName: string; respMarketingName: string;
        fechaObjetivoApertura: string | null;
      }>;
      completedByLocal: Record<string, Record<string, Record<string, string>>>;
    };

    // Resolver responsables por nombre (busca match case-insensitive).
    const users = await prisma.user.findMany({ select: { id: true, name: true } });
    const findUserByName = (name: string): string | null => {
      const n = (name || '').trim().toLowerCase();
      if (!n) return null;
      const match = users.find((u) => (u.name || '').toLowerCase().includes(n));
      return match?.id || null;
    };

    // Pre-cargar templates activos para poblar las tareas de cada apertura.
    const templates = await prisma.openingTaskTemplate.findMany({
      where: { active: true },
      orderBy: [{ mode: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
    });

    let created = 0;
    let skipped = 0;
    let tasksCompleted = 0;

    for (const loc of parsed.locations) {
      const existing = await prisma.opening.findFirst({
        where: { localName: loc.localName },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const respMktId = findUserByName(loc.respMarketingName);
      const respOpsId = findUserByName(loc.respOperacionesName);

      const opening = await prisma.$transaction(async (tx) => {
        const op = await tx.opening.create({
          data: {
            localName: loc.localName,
            zona: loc.zona || '',
            franquiciado: loc.franquiciado || '',
            respOperacionesId: respOpsId,
            respMarketingId: respMktId,
            fechaObjetivoApertura: parseDate(loc.fechaObjetivoApertura) ?? null,
            notas: (!respMktId && loc.respMarketingName)
              ? `Responsable marketing sugerido: ${loc.respMarketingName}`
              : '',
          },
        });
        if (templates.length > 0) {
          await tx.openingTask.createMany({
            data: templates.map((t) => ({
              openingId: op.id,
              templateId: t.id,
              templateTitulo: t.tarea,
              categoria: t.categoria,
              semana: t.semana,
              grupo: t.grupo,
              tipo: t.tipo,
              mode: t.mode,
              orden: t.orden,
              diasEstimados: t.diasEstimados,
              notas: t.notas,
              assignedToId: resolveSuggestedAssignee(t.responsableSugerido, users),
            })),
          });
        }
        return op;
      });
      created++;

      // Marcar como completadas las tareas indicadas para este local.
      const completedForThis = parsed.completedByLocal?.[loc.localName] || {};
      for (const mode of Object.keys(completedForThis)) {
        const byId = completedForThis[mode];
        const templateIds = Object.keys(byId);
        if (templateIds.length === 0) continue;
        const r = await prisma.openingTask.updateMany({
          where: { openingId: opening.id, mode, templateId: { in: templateIds } },
          data: { estado: 'completada', fechaCompletada: new Date() },
        });
        tasksCompleted += r.count;
      }
    }

    res.json({ created, skipped, tasksCompleted });
  } catch (err) {
    console.error('[openings] import-current error:', err);
    res.status(500).json({ error: 'Error al importar aperturas' });
  }
});

export default router;
