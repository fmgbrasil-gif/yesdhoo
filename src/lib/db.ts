import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = db;

const POSTGRES = /^postgres/i.test(process.env.DATABASE_URL ?? '');
/** Filtro "contem" para buscas: no Postgres precisa pedir explicitamente para ignorar maiusculas. */
export const like = (q: string) => (POSTGRES ? { contains: q, mode: 'insensitive' } : { contains: q }) as { contains: string };
