// Безопасно обновяване на базата при нова версия — чиста логика.
//
// Инсталираната каса пази базата си в профила на потребителя; новата версия идва с нова схема.
// Обновяването е САМО добавящо (prisma-migrate: „адитивно пред разрушително“): липсваща таблица
// се създава, липсваща колона се добавя, липсващ индекс се създава. Нищо не се трие и не се
// преименува. Колона, която SQLite не може да добави безопасно (NOT NULL без стойност по
// подразбиране, стойност като CURRENT_TIMESTAMP), е проблем — касата отказва да стартира с
// ясно съобщение, вместо да „поправи“ данни тихо. Фискалните данни не се пипат.

export interface ColumnDef {
  name: string;
  /** Определението след името: „BOOLEAN NOT NULL DEFAULT false“. */
  def: string;
}

export interface ForeignKeyDef {
  columns: string[];
  /** „REFERENCES "A" ("id") ON DELETE … ON UPDATE …“ */
  references: string;
}

export interface TableDef {
  name: string;
  createSql: string;
  columns: ColumnDef[];
  foreignKeys: ForeignKeyDef[];
}

export interface IndexDef {
  name: string;
  table: string;
  sql: string;
}

export interface ParsedSchema {
  tables: TableDef[];
  indexes: IndexDef[];
}

export interface ExistingSchema {
  /** таблица → имена на колоните */
  tables: Map<string, Set<string>>;
  indexes: Set<string>;
}

export function parseSchemaSql(sql: string): ParsedSchema {
  const tables: TableDef[] = [];
  const indexes: IndexDef[] = [];
  const tableRe = /CREATE TABLE "([^"]+)" \(\n([\s\S]*?)\n\);/g;
  for (const m of sql.matchAll(tableRe)) {
    const columns: ColumnDef[] = [];
    const foreignKeys: ForeignKeyDef[] = [];
    for (const raw of m[2]!.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      const col = /^"([^"]+)"\s+(.+)$/.exec(line);
      if (col) {
        columns.push({ name: col[1]!, def: col[2]! });
        continue;
      }
      const fk = /^CONSTRAINT "[^"]+" FOREIGN KEY \(([^)]+)\) (REFERENCES .+)$/.exec(line);
      if (fk) foreignKeys.push({ columns: [...fk[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!), references: fk[2]! });
    }
    tables.push({ name: m[1]!, createSql: m[0], columns, foreignKeys });
  }
  const indexRe = /CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\([^)]*\);/g;
  for (const m of sql.matchAll(indexRe)) indexes.push({ name: m[1]!, table: m[2]!, sql: m[0] });
  return { tables, indexes };
}

/** Може ли SQLite да добави колоната с ALTER TABLE ADD COLUMN, без да губи смисъла ѝ. */
function addable(def: string): string | null {
  if (/PRIMARY KEY|UNIQUE/i.test(def)) return "първичен или уникален ключ";
  const dflt = /DEFAULT\s+(.+)$/i.exec(def)?.[1]?.trim();
  if (dflt && /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(dflt)) return "стойност по подразбиране, която не е постоянна";
  if (/NOT NULL/i.test(def) && !dflt) return "задължителна колона без стойност по подразбиране";
  return null;
}

export function planUpgrade(target: ParsedSchema, existing: ExistingSchema): { statements: string[]; problems: string[] } {
  const statements: string[] = [];
  const problems: string[] = [];
  for (const t of target.tables) {
    const have = existing.tables.get(t.name);
    if (!have) {
      statements.push(t.createSql);
      continue;
    }
    for (const c of t.columns) {
      if (have.has(c.name)) continue;
      // външният ключ върви с колоната — иначе новата връзка остава без референтна цялост
      const fk = t.foreignKeys.find((f) => f.columns.includes(c.name));
      const why = addable(c.def) ?? (fk && fk.columns.length > 1 ? "част от съставен външен ключ" : null);
      if (why) problems.push(`"${t.name}"."${c.name}": ${why} — нужна е ръчна миграция`);
      else statements.push(`ALTER TABLE "${t.name}" ADD COLUMN "${c.name}" ${c.def}${fk ? ` ${fk.references}` : ""}`);
    }
  }
  for (const i of target.indexes) {
    if (!existing.indexes.has(i.name)) statements.push(i.sql);
  }
  return { statements, problems };
}
