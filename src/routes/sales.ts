import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import prisma from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { readSheet } from '../lib/googleSheets';

const requireSalesEditor = requireRole('SUPERADMIN', 'MANAGER');
const requireSuperadmin = requireRole('SUPERADMIN');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

// ── Canonical channels (para orden y validación) ──────────
const CHANNELS = [
  'Local',
  'Rappi',
  'Rappi Turbo',
  'Rappi Veggie',
  'Pedidos Ya',
  'Mas delivery',
  'Mercado Pago',
  'Mercado Pago Veggie',
] as const;

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

// ── Fuzzy match name → franchiseId (mismo enfoque que aiBilling.ts, simplificado) ──
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/jiro\s*sushi\s*/g, '')
    .replace(/sushi\s*/g, '')
    .replace(/jiro\s*/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[b.length][a.length];
}

function matchFranchiseId(name: string, franchises: Array<{ id: string; name: string }>): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  for (const f of franchises) if (normalizeName(f.name) === norm) return f.id;
  for (const f of franchises) {
    const fn = normalizeName(f.name);
    if (fn && (fn.includes(norm) || norm.includes(fn))) return f.id;
  }
  let best: { id: string; dist: number } | null = null;
  for (const f of franchises) {
    const fn = normalizeName(f.name);
    if (!fn) continue;
    const d = levenshtein(norm, fn);
    const t = Math.min(3, Math.floor(Math.max(norm.length, fn.length) * 0.25));
    if (d <= t && (!best || d < best.dist)) best = { id: f.id, dist: d };
  }
  return best?.id || null;
}

// ── GET /api/sales/summary?periodo=YYYY-MM ────────────────
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const periodo = String(req.query.periodo || '');
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      res.status(400).json({ error: 'periodo requerido (YYYY-MM)' });
      return;
    }
    const [y, m] = periodo.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

    const [current, previous] = await Promise.all([
      prisma.salesByChannel.findMany({
        where: { periodo },
        include: { franchise: { select: { id: true, name: true } } },
      }),
      prisma.salesByChannel.findMany({ where: { periodo: prev } }),
    ]);

    const totalOrders = current.reduce((s, r) => s + r.orders, 0);
    const totalRevenue = current.reduce((s, r) => s + r.revenue, 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prevRevenue = previous.reduce((s, r) => s + r.revenue, 0);
    const prevMonthDelta = prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : null;

    // Ranking por local
    const byFranchise = new Map<string, { franchiseId: string; name: string; orders: number; revenue: number }>();
    for (const r of current) {
      const key = r.franchiseId;
      const existing = byFranchise.get(key) || { franchiseId: key, name: r.franchise.name, orders: 0, revenue: 0 };
      existing.orders += r.orders;
      existing.revenue += r.revenue;
      byFranchise.set(key, existing);
    }
    const ranking = Array.from(byFranchise.values()).sort((a, b) => b.revenue - a.revenue);

    // Mix por canal
    const byChannel = new Map<string, { channel: string; orders: number; revenue: number }>();
    for (const r of current) {
      const existing = byChannel.get(r.channel) || { channel: r.channel, orders: 0, revenue: 0 };
      existing.orders += r.orders;
      existing.revenue += r.revenue;
      byChannel.set(r.channel, existing);
    }
    const channelMix = Array.from(byChannel.values())
      .map((c) => ({ ...c, pct: totalRevenue > 0 ? c.revenue / totalRevenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      periodo,
      prev,
      totalOrders,
      totalRevenue,
      avgTicket,
      prevMonthDelta,
      ranking,
      channelMix,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener resumen de ventas' });
  }
});

// ── GET /api/sales/monthly?franchiseId=&channel=&from=&to= ─
// Serie temporal para gráficos de evolución.
router.get('/monthly', authenticate, async (req: Request, res: Response) => {
  try {
    const franchiseId = req.query.franchiseId as string | undefined;
    const channel = req.query.channel as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const where: Record<string, unknown> = {};
    if (franchiseId) where.franchiseId = franchiseId;
    if (channel) where.channel = channel;
    if (from || to) {
      const p: Record<string, string> = {};
      if (from) p.gte = from;
      if (to) p.lte = to;
      where.periodo = p;
    }
    const rows = await prisma.salesByChannel.findMany({
      where,
      orderBy: [{ periodo: 'asc' }],
    });

    // Agregamos por periodo (y por canal si no viene fijo) para devolver serie limpia.
    const map = new Map<string, { periodo: string; orders: number; revenue: number }>();
    for (const r of rows) {
      const key = r.periodo;
      const existing = map.get(key) || { periodo: key, orders: 0, revenue: 0 };
      existing.orders += r.orders;
      existing.revenue += r.revenue;
      map.set(key, existing);
    }
    res.json(Array.from(map.values()));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener serie mensual' });
  }
});

// ── GET /api/sales/franchise/:id?periodo=YYYY-MM ──────────
router.get('/franchise/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const franchiseId = req.params.id as string;
    const periodo = String(req.query.periodo || '');
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      res.status(400).json({ error: 'periodo requerido (YYYY-MM)' });
      return;
    }
    const [y, m] = periodo.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

    const [current, previous, history] = await Promise.all([
      prisma.salesByChannel.findMany({ where: { franchiseId, periodo } }),
      prisma.salesByChannel.findMany({ where: { franchiseId, periodo: prev } }),
      prisma.salesByChannel.findMany({ where: { franchiseId }, orderBy: [{ periodo: 'asc' }] }),
    ]);

    const totalOrders = current.reduce((s, r) => s + r.orders, 0);
    const totalRevenue = current.reduce((s, r) => s + r.revenue, 0);
    const prevRevenue = previous.reduce((s, r) => s + r.revenue, 0);
    const delta = prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : null;

    const historyByMonth = new Map<string, { periodo: string; orders: number; revenue: number }>();
    for (const r of history) {
      const e = historyByMonth.get(r.periodo) || { periodo: r.periodo, orders: 0, revenue: 0 };
      e.orders += r.orders;
      e.revenue += r.revenue;
      historyByMonth.set(r.periodo, e);
    }

    res.json({
      franchiseId,
      periodo,
      totalOrders,
      totalRevenue,
      avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      delta,
      channels: current.sort((a, b) => b.revenue - a.revenue),
      history: Array.from(historyByMonth.values()),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener detalle de la franquicia' });
  }
});

// ── GET /api/sales/weekday?periodo=YYYY-MM ────────────────
router.get('/weekday', authenticate, async (req: Request, res: Response) => {
  try {
    const periodo = req.query.periodo as string | undefined;
    const where: Record<string, unknown> = {};
    if (periodo) where.periodo = periodo;
    const rows = await prisma.salesWeekday.findMany({ where, orderBy: [{ periodo: 'asc' }] });
    // Orden lógico dentro de cada periodo (lunes → domingo).
    const idx = (w: string) => WEEKDAYS.indexOf(w as (typeof WEEKDAYS)[number]);
    rows.sort((a, b) => (a.periodo === b.periodo ? idx(a.weekday) - idx(b.weekday) : a.periodo.localeCompare(b.periodo)));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener distribución semanal' });
  }
});

// ── POST /api/sales/upload ── CSV con columnas: local, periodo, canal, orders, revenue
router.post('/upload', authenticate, requireSalesEditor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Archivo requerido' });
      return;
    }
    const text = req.file.buffer.toString('utf-8');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const franchises = await prisma.franchise.findMany({ select: { id: true, name: true } });

    let matched = 0;
    let missing = 0;
    const missingNames = new Set<string>();
    const rows: Array<{ franchiseId: string; periodo: string; channel: string; orders: number; revenue: number }> = [];

    for (const raw of parsed.data as Array<Record<string, string>>) {
      const local = String(raw.local || raw.Local || raw.franchise || raw.sucursal || '').trim();
      const periodo = String(raw.periodo || raw.Periodo || raw.period || '').trim();
      const channel = String(raw.canal || raw.channel || raw.Canal || '').trim();
      const orders = Number(raw.orders || raw.pedidos || raw.ordenes || 0);
      const revenue = Number(raw.revenue || raw.facturacion || raw.facturación || raw.ventas || 0);
      if (!local || !periodo || !channel) continue;
      if (!/^\d{4}-\d{2}$/.test(periodo)) continue;
      const fid = matchFranchiseId(local, franchises);
      if (!fid) { missing++; missingNames.add(local); continue; }
      matched++;
      rows.push({ franchiseId: fid, periodo, channel, orders: isFinite(orders) ? orders : 0, revenue: isFinite(revenue) ? revenue : 0 });
    }

    await prisma.$transaction(
      rows.map((r) =>
        prisma.salesByChannel.upsert({
          where: { franchiseId_periodo_channel: { franchiseId: r.franchiseId, periodo: r.periodo, channel: r.channel } },
          create: r,
          update: { orders: r.orders, revenue: r.revenue },
        })
      )
    );

    res.json({ imported: rows.length, matched, missing, missingNames: Array.from(missingNames) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al importar CSV' });
  }
});

// ── POST /api/sales/import-2026 ── import inicial idempotente desde JSON estático
// Requiere SUPERADMIN. El JSON vive en scripts/data/sales-2026.json.
router.post('/import-2026', authenticate, requireSuperadmin, async (_req: AuthRequest, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dataset = require('../../scripts/data/sales-2026.json') as {
      salesByChannel: Array<{ local: string; periodo: string; channel: string; orders: number; revenue: number }>;
      weekday: Array<{ periodo: string; weekday: string; orders: number; revenue: number }>;
    };

    const franchises = await prisma.franchise.findMany({ select: { id: true, name: true } });
    const missingNames = new Set<string>();
    const channelRows: Array<{ franchiseId: string; periodo: string; channel: string; orders: number; revenue: number }> = [];
    for (const raw of dataset.salesByChannel) {
      const fid = matchFranchiseId(raw.local, franchises);
      if (!fid) { missingNames.add(raw.local); continue; }
      channelRows.push({ franchiseId: fid, periodo: raw.periodo, channel: raw.channel, orders: raw.orders, revenue: raw.revenue });
    }

    await prisma.$transaction([
      ...channelRows.map((r) =>
        prisma.salesByChannel.upsert({
          where: { franchiseId_periodo_channel: { franchiseId: r.franchiseId, periodo: r.periodo, channel: r.channel } },
          create: r,
          update: { orders: r.orders, revenue: r.revenue },
        })
      ),
      ...dataset.weekday.map((w) =>
        prisma.salesWeekday.upsert({
          where: { periodo_weekday: { periodo: w.periodo, weekday: w.weekday } },
          create: w,
          update: { orders: w.orders, revenue: w.revenue },
        })
      ),
    ]);

    res.json({
      channelRowsImported: channelRows.length,
      weekdayRowsImported: dataset.weekday.length,
      missingFranchises: Array.from(missingNames),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error en import 2026' });
  }
});

// ── POST /api/sales/sync-sheet ─────────────────────────────
// Sincroniza SalesByChannel desde el Google Sheet fuente. Solo SUPERADMIN.
// Config: env SALES_SHEET_ID (id del spreadsheet) + GOOGLE_SA_KEY_JSON
// (credenciales del service account). Los tabs están hardcodeados porque
// dependen del layout del sheet — si cambian, se edita acá y se redeploy.
//
// El sheet es un PIVOT: locales en filas (con una fila de "encabezado de
// local" que solo tiene el nombre), canales anidados debajo, meses en
// columnas (pares [valor, variación %] — solo se lee la 1ra col de cada par).

const SHEET_TABS = {
  revenue: 'Facturación x local x canal (Mensual)',
  orders: 'Pedidos x local x canal (Mensual)',
} as const;

// Whitelist de canales — comparación EXACTA (sin trim). Así las filas
// duplicadas del sheet como "Rappi " (con espacio final, que es el subtotal
// del grupo Rappi) NO matchean con "Rappi" y van a skippedChannels —
// evitamos doble conteo.
const CANONICAL_CHANNEL_SET = new Set<string>(CHANNELS);

// Parsea un valor tipo " $1.076.090" → 1076090. También acepta ints/floats
// crudos (por si el sheet cambia el formato).
function parsePivotValue(raw: string | undefined | null): number {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  if (!s || s === '-') return 0;
  // Quita $, espacios y separadores de miles (puntos). Coma como decimal.
  const clean = s.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Devuelve el año 4 dígitos vigente del sheet. Los meses vienen numerados
// 1-12 y el sheet no incluye el año en cada columna, así que asumimos el
// año actual (el sheet se llama "Distribución de venta 2026"). Configurable
// vía env SALES_SHEET_YEAR si en algún momento hay que sincronizar histórico.
function resolveSheetYear(): string {
  const envYear = process.env.SALES_SHEET_YEAR;
  if (envYear && /^\d{4}$/.test(envYear)) return envYear;
  return String(new Date().getFullYear());
}

// Parser del pivot. Devuelve un array de {local, mes(1-12), channel, value}.
//
// Layout del sheet fuente (por cada local):
//   ┌ nombre del local (col A, resto vacío)     ← "Adrogue"
//   ├ "Canal","1","2","","3",...                 ← header meses (valores $)
//   ├ "Rappi"," $X"," $Y",...
//   ├ ...más canales...
//   ├ "Total"...                                  ← subtotal $
//   ├ "Canal","1","2","",...                     ← header repetido (variación %)
//   ├ "Rappi","-70%","-67%",...
//   ├ ...canales con %...
//   ├ "Total"..."%"                              ← subtotal %
//   └ (siguiente local...)
//
// Estrategia: iterar TODA la fila trackeando currentLocal + monthCols.
// Solo procesamos filas con valores $ (celda contiene "$"). Las filas del
// bloque de variación % se ignoran automáticamente porque sus valores no
// tienen "$".
function parsePivotTab(rows: string[][]): Array<{ local: string; monthNum: number; channel: string; value: number }> {
  const out: Array<{ local: string; monthNum: number; channel: string; value: number }> = [];
  let currentLocal = '';
  let monthCols: Array<{ col: number; monthNum: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const firstCell = String(row[0] || '').trim();
    if (!firstCell) continue;

    const firstLower = firstCell.toLowerCase();

    // Header "Canal": actualizar mapping mes → col.
    if (firstLower === 'canal') {
      const newCols: Array<{ col: number; monthNum: number }> = [];
      for (let c = 1; c < row.length; c++) {
        const v = String(row[c] || '').trim();
        const n = Number(v);
        if (Number.isInteger(n) && n >= 1 && n <= 12) newCols.push({ col: c, monthNum: n });
      }
      if (newCols.length > 0) monthCols = newCols;
      continue;
    }

    // Subtotal por local — skip.
    if (firstLower === 'total') continue;

    // ¿Esta fila tiene valores $ en las cols de mes?
    let hasDollarValue = false;
    let hasAnyValue = false;
    for (const { col } of monthCols) {
      const cell = String(row[col] || '').trim();
      if (cell !== '' && cell !== '-') hasAnyValue = true;
      if (cell.includes('$')) { hasDollarValue = true; break; }
    }

    if (!hasDollarValue) {
      // Sin valores $: puede ser (a) nombre de local (nueva sección, todas
      // las cols vacías o solo unas pocas con "0"), o (b) fila del bloque
      // de variación % (valores tipo "-70%"). Distinción: si NO hay ningún
      // valor en cols de mes → asumimos nombre de local; si hay valores
      // (pero sin $), es variación % → skip.
      if (!hasAnyValue) currentLocal = firstCell;
      continue;
    }

    // Fila de canal con valores $.
    if (!currentLocal || monthCols.length === 0) continue;
    const channel = firstCell; // sin trim — respetamos exact case + espacios
    for (const { col, monthNum } of monthCols) {
      const value = parsePivotValue(row[col]);
      out.push({ local: currentLocal, monthNum, channel, value });
    }
  }

  return out;
}

router.post('/sync-sheet', authenticate, requireSuperadmin, async (_req: AuthRequest, res: Response) => {
  try {
    const spreadsheetId = process.env.SALES_SHEET_ID;
    if (!spreadsheetId) {
      res.status(500).json({ error: 'Falta env SALES_SHEET_ID' });
      return;
    }

    const [revenueRows, ordersRows] = await Promise.all([
      readSheet(spreadsheetId, SHEET_TABS.revenue),
      readSheet(spreadsheetId, SHEET_TABS.orders),
    ]);

    const revenueParsed = parsePivotTab(revenueRows);
    const ordersParsed = parsePivotTab(ordersRows);

    const year = resolveSheetYear();
    const franchises = await prisma.franchise.findMany({ select: { id: true, name: true } });

    // Merge por (local, periodo, channel). Aceptamos 0 si el sheet no
    // tiene una de las dos métricas para esa combinación.
    type Key = string;
    const bucket = new Map<Key, { local: string; periodo: string; channel: string; orders: number; revenue: number }>();
    const keyOf = (local: string, periodo: string, channel: string) => `${local}|${periodo}|${channel}`;

    const missingFranchises = new Set<string>();
    const skippedChannels = new Set<string>();

    const absorb = (arr: Array<{ local: string; monthNum: number; channel: string; value: number }>, kind: 'orders' | 'revenue') => {
      for (const r of arr) {
        // Comparación EXACTA con la whitelist — "Rappi " (con espacio, que
        // es el subtotal del grupo Rappi en el sheet) NO matchea con "Rappi"
        // → va a skippedChannels y se evita el doble conteo.
        if (!CANONICAL_CHANNEL_SET.has(r.channel)) {
          skippedChannels.add(r.channel);
          continue;
        }
        const periodo = `${year}-${String(r.monthNum).padStart(2, '0')}`;
        const k = keyOf(r.local, periodo, r.channel);
        let entry = bucket.get(k);
        if (!entry) {
          entry = { local: r.local, periodo, channel: r.channel, orders: 0, revenue: 0 };
          bucket.set(k, entry);
        }
        // Suma en vez de pisar: si el sheet tiene filas duplicadas con el
        // mismo canal (ej. "Mercado Pago" aparece 2 veces), suman sus valores.
        entry[kind] += r.value;
      }
    };
    absorb(revenueParsed, 'revenue');
    absorb(ordersParsed, 'orders');

    // Resolver local → franchiseId. Los que no matchean van a missingFranchises.
    const finalRows: Array<{ franchiseId: string; periodo: string; channel: string; orders: number; revenue: number }> = [];
    for (const entry of bucket.values()) {
      const fid = matchFranchiseId(entry.local, franchises);
      if (!fid) { missingFranchises.add(entry.local); continue; }
      finalRows.push({
        franchiseId: fid,
        periodo: entry.periodo,
        channel: entry.channel,
        orders: entry.orders,
        revenue: entry.revenue,
      });
    }

    // Upsert en lotes (Prisma no tiene upsertMany nativo).
    for (const r of finalRows) {
      await prisma.salesByChannel.upsert({
        where: { franchiseId_periodo_channel: { franchiseId: r.franchiseId, periodo: r.periodo, channel: r.channel } },
        create: r,
        update: { orders: r.orders, revenue: r.revenue },
      });
    }

    res.json({
      tabsProcessed: Object.values(SHEET_TABS),
      channelRowsUpserted: finalRows.length,
      missingFranchises: Array.from(missingFranchises),
      skippedChannels: Array.from(skippedChannels),
      // Debug: cuántas filas trajo cada tab del sheet y cuántas líneas de
      // canal parseó cada uno. Sirve para diagnosticar 0 filas actualizadas.
      debug: {
        revenueRawRows: revenueRows.length,
        revenueParsedLines: revenueParsed.length,
        ordersRawRows: ordersRows.length,
        ordersParsedLines: ordersParsed.length,
        firstRevenueChannels: revenueParsed.slice(0, 10).map((r) => r.channel),
        firstRevenueLocals: Array.from(new Set(revenueParsed.map((r) => r.local))).slice(0, 10),
      },
      note: 'SalesWeekday no se sincroniza desde el sheet (queda igual — se llena con el JSON de import o CSV upload).',
    });
  } catch (err: any) {
    console.error('[sales] sync-sheet error:', err);
    res.status(500).json({ error: err?.message || 'Error al sincronizar con Google Sheets' });
  }
});

export default router;
