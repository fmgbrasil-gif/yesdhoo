// Build para a Vercel: troca o banco para Postgres, cria/atualiza as tabelas, cria a conta inicial e compila.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const schema = readFileSync('prisma/schema.prisma', 'utf8')
  .replace('provider = "sqlite"', 'provider  = "postgresql"')
  .replace('url      = env("DATABASE_URL")', 'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")');
writeFileSync('prisma/schema.prisma', schema); // so no ambiente de build; o repositorio continua em SQLite

for (const name of ['DATABASE_URL', 'DIRECT_URL', 'AUTH_SECRET']) {
  if (!process.env[name]) { console.error(`Variável ${name} não definida no projeto da Vercel.`); process.exit(1); }
}
run('npx prisma generate');
run('npx prisma db push --skip-generate');
run('npx tsx prisma/seed.ts');
run('npx next build');
