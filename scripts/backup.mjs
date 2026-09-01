// Выгрузка базы к себе на диск.
//
// Резервные копии Supabase делает сам, но копия, из которой ни разу не
// восстанавливались, — это не копия, а надежда. Здесь два действия:
// выгрузить дамп и сложить его туда, где он лежит вне облака.
//
// Строку подключения берём из переменной окружения SUPABASE_DB_URL —
// в файл она не пишется и в репозиторий не попадает.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(`
Не задана строка подключения.

  1. Supabase → Project Settings → Database → Connection string → URI
  2. Подставь туда пароль базы и выполни:

     PowerShell:  $env:SUPABASE_DB_URL = "postgresql://..."
     Git Bash:    export SUPABASE_DB_URL="postgresql://..."

  3. npm run db:backup

Строка содержит пароль — не сохраняй её в файлы репозитория.
`);
  process.exit(1);
}

const dir = path.resolve("backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

function dump(name, args) {
  const file = path.join(dir, `kazdez_${stamp}_${name}.sql`);
  process.stdout.write(`${name}… `);
  execFileSync("npx", ["supabase", "db", "dump", "--db-url", url, "-f", file, ...args], {
    stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32",
  });
  console.log(`${(statSync(file).size / 1024).toFixed(0)} КБ → ${path.relative(process.cwd(), file)}`);
}

// Схема и данные лежат отдельно: восстановление всегда идёт схемой вперёд,
// и раздельные файлы позволяют залить данные в уже готовую структуру.
dump("schema", []);
dump("data", ["--data-only"]);

const kept = readdirSync(dir).filter((f) => f.endsWith(".sql")).length;
console.log(`\nГотово. Файлов в backups/: ${kept}.`);
console.log("Скопируй их туда, где они переживут потерю доступа к облаку: внешний диск или другой облачный аккаунт.");
console.log("Раз в квартал проверь восстановление — порядок в supabase/BACKUP.md.");
