import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const requireProjectEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

const router = Router();

// ─── Projects ─────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.archived === '1';
    const where = includeArchived ? {} : { archived: false };
    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { tasks: true } } },
    });
    res.json(projects);
  } catch {
    res.status(500).json({ error: 'Error al obtener proyectos' });
  }
});

router.post('/', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { name, color, description } = req.body || {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'El nombre es obligatorio' });
      return;
    }
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        color: typeof color === 'string' && color ? color : '#888888',
        description: typeof description === 'string' ? description : '',
        sections: {
          create: [
            { name: 'Por hacer', order: 0 },
            { name: 'En curso', order: 1 },
            { name: 'Hecho', order: 2 },
          ],
        },
      },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    res.status(201).json(project);
  } catch {
    res.status(500).json({ error: 'Error al crear el proyecto' });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id as string },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    if (!project) {
      res.status(404).json({ error: 'Proyecto no encontrado' });
      return;
    }
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Error al obtener el proyecto' });
  }
});

router.patch('/:id', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { name, description, color, archived } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof name === 'string') data.name = name.trim();
    if (typeof description === 'string') data.description = description;
    if (typeof color === 'string') data.color = color;
    if (typeof archived === 'boolean') data.archived = archived;
    const project = await prisma.project.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Error al actualizar el proyecto' });
  }
});

router.delete('/:id', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar el proyecto' });
  }
});

// ─── Sections ─────────────────────────────────────────

router.post('/:id/sections', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'El nombre es obligatorio' });
      return;
    }
    const max = await prisma.projectSection.aggregate({
      where: { projectId: req.params.id as string },
      _max: { order: true },
    });
    const order = (max._max.order ?? -1) + 1;
    const section = await prisma.projectSection.create({
      data: { projectId: req.params.id as string, name: name.trim(), order },
    });
    res.status(201).json(section);
  } catch {
    res.status(500).json({ error: 'Error al crear la sección' });
  }
});

router.post('/:id/sections/reorder', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'ids debe ser un array' });
      return;
    }
    await prisma.$transaction(
      ids.map((sid: string, idx: number) =>
        prisma.projectSection.update({ where: { id: sid }, data: { order: idx } })
      )
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al reordenar secciones' });
  }
});

// ─── Tasks list/create ─────────────────────────────────

router.get('/:id/tasks', authenticate, async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { projectId: req.params.id as string, parentTaskId: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true, avatar: true, role: true } },
        dependencies: {
          include: {
            dependsOn: { select: { id: true, title: true, done: true } },
          },
        },
        _count: {
          select: { subtasks: true, comments: true, attachments: true },
        },
      },
    });
    res.json(tasks);
  } catch {
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

router.post('/:id/tasks', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { title, description, priority, sectionId, assigneeId, startDate, dueDate, publishDate, parentTaskId } = req.body || {};
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'El título es obligatorio' });
      return;
    }
    const projectId = req.params.id as string;
    const max = await prisma.task.aggregate({
      where: { projectId, sectionId: sectionId ?? null, parentTaskId: parentTaskId ?? null },
      _max: { order: true },
    });
    const order = (max._max.order ?? -1) + 1;
    const task = await prisma.task.create({
      data: {
        projectId,
        title: title.trim(),
        description: typeof description === 'string' ? description : '',
        priority: priority || 'NONE',
        sectionId: sectionId || null,
        assigneeId: assigneeId || null,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        publishDate: publishDate ? new Date(publishDate) : null,
        parentTaskId: parentTaskId || null,
        order,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true, role: true } },
        _count: { select: { subtasks: true, comments: true, attachments: true } },
      },
    });
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Error al crear la tarea' });
  }
});

router.post('/:id/tasks/reorder', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const { sectionId, ids } = req.body || {};
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'ids debe ser un array' });
      return;
    }
    await prisma.$transaction(
      ids.map((tid: string, idx: number) =>
        prisma.task.update({
          where: { id: tid },
          data: { order: idx, sectionId: sectionId ?? null },
        })
      )
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al reordenar tareas' });
  }
});

export default router;
