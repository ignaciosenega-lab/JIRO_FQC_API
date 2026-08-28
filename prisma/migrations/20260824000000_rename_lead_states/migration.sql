-- Renombramos los estados de leads a la nomenclatura de venta del negocio.
-- Estado es un string libre (no un enum), así que solo hay que UPDATE los valores.
UPDATE "FranchiseLead" SET "estado" = 'seguimiento' WHERE "estado" = 'contactado';
UPDATE "FranchiseLead" SET "estado" = 'negocio'     WHERE "estado" = 'visitando';
UPDATE "FranchiseLead" SET "estado" = 'compro'      WHERE "estado" = 'aprobado';
UPDATE "FranchiseLead" SET "estado" = 'basura'      WHERE "estado" = 'rechazado';
