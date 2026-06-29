import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const requireProjectEditor = requireRole('SUPERADMIN', 'MANAGER', 'OPERACIONES');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const rand = Math.random().toString(36).slice(2, 8);
      cb(null, `task-${Date.now()}-${rand}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();

const taskInclude = {
  assignee: { select: { id: true, name: true, avatar: true, role: true } },
  subtasks: {
    orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      assignee: { select: { id: true, name: true, avatar: true, role: true } },
      _count: { select: { subtasks: true, comments: true, attachments: true } },
    },
  },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  dependencies: {
    include: {
      dependsOn: { select: { id: true, title: true, done: true } },
    },
  },
  _count: { select: { subtasks: true, comments: true, attachments: true } },
};

router.get('/:tid', authenticate, async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.tid as string },
      include: taskInclude,
    });
    if (!task) {
      res.status(404).json({ error: 'Tarea no encontrada' });
      return;
    }
    res.json(task);
  } catch {
    res.status(500).json({ error: 'Error al obtener la tarea' });
  }
});

router.patch('/:tid', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') data.title = body.title.trim();
    if (typeof body.description === 'string') data.description = body.description;
    if (typeof body.priority === 'string') data.priority = body.priority;
    if ('sectionId' in body) data.sectionId = body.sectionId || null;
    if ('assigneeId' in body) data.assigneeId = body.assigneeId || null;
    if ('startDate' in body) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if ('dueDate' in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if ('publishDate' in body) data.publishDate = body.publishDate ? new Date(body.publishDate) : null;
    if (typeof body.order === 'number') data.order = body.order;
    if (typeof body.done === 'boolean') {
      data.done = body.done;
      data.completedAt = body.done ? new Date() : null;
    }
    const task = await prisma.task.update({
      where: { id: req.params.tid as string },
      data,
      include: taskInclude,
    });
    res.json(task);
  } catch {
    res.status(500).json({ error: 'Error al actualizar la tarea' });
  }
});

router.delete('/:tid', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    await prisma.task.delete({ where: { id: req.params.tid as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar la tarea' });
  }
});

// ─── Comments ─────────────────────────────────────────

router.post('/:tid/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { body } = req.body || {};
    if (!body || typeof body !== 'string' || !body.trim()) {
      res.status(400).json({ error: 'El comentario no puede estar vacío' });
      return;
    }
    const comment = await prisma.taskComment.create({
      data: {
        taskId: req.params.tid as string,
        body: body.trim(),
        authorId: req.userId || null,
      },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    });
    res.status(201).json(comment);
  } catch {
    res.status(500).json({ error: 'Error al agregar el comentario' });
  }
});

router.delete('/:tid/comments/:cid', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.taskComment.delete({ where: { id: req.params.cid as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar el comentario' });
  }
});

// ─── Attachments ───────────────────────────────────────

router.post('/:tid/attachments', authenticate, requireProjectEditor, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Falta el archivo' });
      return;
    }
    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: req.params.tid as string,
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        mime: req.file.mimetype || null,
        size: req.file.size || null,
        uploadedById: req.userId || null,
      },
    });
    res.status(201).json(attachment);
  } catch {
    res.status(500).json({ error: 'Error al subir el archivo' });
  }
});

router.delete('/:tid/attachments/:aid', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const att = await prisma.taskAttachment.findUnique({ where: { id: req.params.aid as string } });
    if (att?.fileUrl?.startsWith('/uploads/')) {
      const filePath = path.join(uploadsDir, path.basename(att.fileUrl));
      fs.unlink(filePath, () => { /* best effort */ });
    }
    await prisma.taskAttachment.delete({ where: { id: req.params.aid as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar el adjunto' });
  }
});

// ─── Dependencies ─────────────────────────────────────

router.post('/:tid/dependencies', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.tid as string;
    const { dependsOnId } = req.body || {};
    if (!dependsOnId || typeof dependsOnId !== 'string') {
      res.status(400).json({ error: 'dependsOnId es obligatorio' });
      return;
    }
    if (taskId === dependsOnId) {
      res.status(400).json({ error: 'Una tarea no puede depender de sí misma' });
      return;
    }
    const [a, b] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId } }),
      prisma.task.findUnique({ where: { id: dependsOnId } }),
    ]);
    if (!a || !b) {
      res.status(404).json({ error: 'Tarea no encontrada' });
      return;
    }
    if (a.projectId !== b.projectId) {
      res.status(400).json({ error: 'Las tareas deben pertenecer al mismo proyecto' });
      return;
    }
    const reverse = await prisma.taskDependency.findFirst({
      where: { taskId: dependsOnId, dependsOnId: taskId },
    });
    if (reverse) {
      res.status(400).json({ error: 'Ciclo detectado: la otra tarea ya depende de esta' });
      return;
    }
    const dep = await prisma.taskDependency.create({
      data: { taskId, dependsOnId },
      include: { dependsOn: { select: { id: true, title: true, done: true } } },
    });
    res.status(201).json(dep);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') {
      res.status(409).json({ error: 'La dependencia ya existe' });
      return;
    }
    res.status(500).json({ error: 'Error al crear la dependencia' });
  }
});

router.delete('/:tid/dependencies/:depId', authenticate, requireProjectEditor, async (req: Request, res: Response) => {
  try {
    await prisma.taskDependency.delete({ where: { id: req.params.depId as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar la dependencia' });
  }
});

export default router;
