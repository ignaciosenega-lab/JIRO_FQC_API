-- Rename old enum and create new one with the 4 target roles
ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'MANAGER', 'OPERACIONES', 'FRANQUICIA');

-- Drop default so we can safely cast
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- Migrate existing values: ADMIN -> SUPERADMIN, FRANCHISE -> FRANQUICIA
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role" USING (
    CASE "role"::text
      WHEN 'ADMIN' THEN 'SUPERADMIN'::"Role"
      WHEN 'FRANCHISE' THEN 'FRANQUICIA'::"Role"
    END
  );

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'FRANQUICIA';

DROP TYPE "Role_old";
