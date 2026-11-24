/** Modalidades de cadastro: cliente (anunciante que paga), parceiro (local da tela) e cortesia (anuncia sem pagar). */
export const CLIENT_KINDS = ['cliente', 'parceiro', 'cortesia'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const parseKind = (v: unknown): ClientKind => (CLIENT_KINDS.includes(v as ClientKind) ? (v as ClientKind) : 'cliente');
export const kindLabel = (k?: string | null) => (k === 'parceiro' ? 'Parceiro' : k === 'cortesia' ? 'Cortesia' : 'Cliente');
export const kindPlural = (k?: string | null) => (k === 'parceiro' ? 'Parceiros' : k === 'cortesia' ? 'Cortesias' : 'Clientes');
export const kindBadge = (k?: string | null) => (k === 'parceiro' ? 'bg-sky-100 text-sky-700' : k === 'cortesia' ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-700');
