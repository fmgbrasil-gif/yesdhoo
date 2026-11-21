'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3, Monitor, Film, Layers, Sparkles, Rss, Megaphone, Wrench, Users, FileBarChart, UserCog, Bell, Moon, Sun, LogOut, Menu, X, Star, Camera, PanelLeftClose, Wallet, Building2, Crown, PanelLeftOpen, Network, Receipt, Landmark, HandCoins,
} from 'lucide-react';
import { Logo } from './Logo';
import { Avatar } from './basic';

type Notif = { id: string; message: string; link: string | null; read: boolean };
type Props = {
  user: { name: string; email: string; image: string | null; role: string; superAdmin: boolean };
  company: { name: string; logo: string | null; brand?: boolean };
  favorites: { id: string; name: string; online: boolean }[];
  notifications: Notif[];
  logout: () => Promise<void>;
  markRead: () => Promise<void>;
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/telas', label: 'Minhas telas', icon: Monitor },
  { group: 'Conteúdos' },
  { href: '/midias', label: 'Minhas mídias', icon: Film },
  { href: '/grupos', label: 'Grupos de mídia', icon: Layers },
  { href: '/biblioteca', label: 'Conteúdos dinâmicos', icon: Sparkles },
  { href: '/rss', label: 'RSS personalizado', icon: Rss },
  { href: '/avisos', label: 'Avisos', icon: Megaphone },
  { href: '/utilitarios', label: 'Utilitários', icon: Wrench },
  { href: '/instagram', label: 'Instagram', icon: Camera },
  { group: 'Gestão' },
  { href: '/clientes', label: 'Clientes e parceiros', icon: Users },
  { href: '/operacoes', label: 'Operações', icon: Network, admin: true },
  { href: '/financeiro', label: 'Financeiro', icon: Wallet, admin: true },
  { href: '/receber', label: 'Contas a receber', icon: HandCoins, admin: true },
  { href: '/pagar', label: 'Contas a pagar', icon: Receipt, admin: true },
  { href: '/caixa', label: 'Caixa e contas', icon: Landmark, admin: true },
  { href: '/relatorios', label: 'Relatório de exibições', icon: FileBarChart },
  { href: '/usuarios', label: 'Usuários', icon: UserCog, admin: true },
  { href: '/empresa', label: 'Minha empresa', icon: Building2, admin: true },
  { group: 'Plataforma', superAdmin: true },
  { href: '/plataforma', label: 'Empresas clientes', icon: Crown, superAdmin: true },
] as const;

export function Sidebar({ user, company, favorites, notifications, logout, markRead }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false); // gaveta no celular
  const [mini, setMini] = useState(false);
  const [dark, setDark] = useState(false);
  const [bell, setBell] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setMini(localStorage.getItem('yd-mini') === '1');
  }, []);
  useEffect(() => { setOpen(false); setBell(false); }, [path]);

  const toggleDark = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    localStorage.setItem('yd-theme', d ? 'dark' : 'light');
  };
  const toggleMini = () => { localStorage.setItem('yd-mini', mini ? '0' : '1'); setMini(!mini); };
  const tool = 'flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800 hover:text-white';

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3 lg:hidden">
        <Logo />
        <button className={tool} aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-ink-950/60 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex ${mini ? 'lg:w-[76px]' : 'lg:w-64'} w-72 flex-col bg-ink-900 text-ink-200 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? '' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" aria-label="Início" className="flex min-w-0 items-center gap-2">
            {company.logo && company.brand
              ? <img src={company.logo} alt={company.name} className={`${mini ? 'h-9' : 'h-14'} w-auto max-w-[190px] object-contain`} /> /* eslint-disable-line @next/next/no-img-element */
              : company.logo
              ? <><img src={company.logo} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain p-0.5" />{!mini && <span className="truncate text-sm font-bold text-white">{company.name}</span>}</> /* eslint-disable-line @next/next/no-img-element */
              : <Logo compact={mini} />}
          </Link>
          <button className={`${tool} lg:hidden`} aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Principal">
          {NAV.map((n, i) => {
            if ('superAdmin' in n && n.superAdmin && !user.superAdmin) return null;
            if ('group' in n) return mini ? <hr key={i} className="my-3 border-ink-700" /> : <p key={i} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{n.group}</p>;
            if ('admin' in n && n.admin && user.role !== 'admin') return null;
            const active = path === n.href || path.startsWith(n.href + '/');
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} title={n.label} aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-brand-400 text-on-brand' : 'hover:bg-ink-800 hover:text-white'} ${mini ? 'lg:justify-center lg:px-0' : ''}`}>
                <Icon size={18} className="shrink-0" /><span className={mini ? 'lg:hidden' : ''}>{n.label}</span>
              </Link>
            );
          })}
          {!mini && favorites.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Telas favoritas</p>
              {favorites.map((f) => (
                <Link key={f.id} href={`/telas/${f.id}`} className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm hover:bg-ink-800 hover:text-white">
                  <Star size={14} className="shrink-0 text-brand-400" /><span className="flex-1 truncate">{f.name}</span>
                  <span className={`h-2 w-2 rounded-full ${f.online ? 'bg-emerald-400' : 'bg-ink-500'}`} title={f.online ? 'Online' : 'Offline'} />
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-ink-700 p-3">
          <div className={`mb-2 flex gap-1 ${mini ? 'lg:flex-col lg:items-center' : ''}`}>
            <button className={`${tool} relative`} title="Notificações" aria-label={`Notificações (${unread} não lidas)`} onClick={() => setBell(!bell)}>
              <Bell size={17} />{unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
            </button>
            <button className={tool} title={dark ? 'Modo claro' : 'Modo escuro'} aria-label="Alternar tema" onClick={toggleDark}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className={`${tool} hidden lg:flex`} title={mini ? 'Expandir menu' : 'Recolher menu'} aria-label="Recolher menu" onClick={toggleMini}>{mini ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
            <form action={logout} className={mini ? '' : 'ml-auto'}><button className={tool} title="Sair" aria-label="Sair"><LogOut size={17} /></button></form>
          </div>
          <Link href="/conta" className={`flex items-center gap-3 rounded-lg p-2 hover:bg-ink-800 ${mini ? 'lg:justify-center' : ''}`} title="Minha conta">
            <Avatar src={user.image} name={user.name} size={36} />
            <span className={`min-w-0 ${mini ? 'lg:hidden' : ''}`}>
              <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
              <span className="block truncate text-xs text-ink-400">{user.email}</span>
            </span>
          </Link>
        </div>
      </aside>
      {bell && (
        <div className="fixed inset-0 z-50" onClick={() => setBell(false)}>
          <div className="card absolute bottom-4 left-4 right-4 max-h-[70vh] overflow-y-auto p-0 lg:left-64 lg:right-auto lg:w-96" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Notificações">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-700">
              <h2 className="font-bold">Notificações ({notifications.length})</h2>
              {unread > 0 && <form action={markRead}><button className="text-xs font-semibold text-brand-700 dark:text-brand-300">Marcar como lidas</button></form>}
            </div>
            {notifications.length === 0 && <p className="p-4 text-sm text-ink-400">Nenhuma notificação por enquanto.</p>}
            {notifications.map((n) => (
              <div key={n.id} className="border-b border-ink-100 px-4 py-3 text-sm last:border-0 dark:border-ink-700">
                <p className={n.read ? 'text-ink-400' : 'font-medium'}>{n.message}</p>
                {n.link && <Link href={n.link} className="text-xs font-semibold text-brand-700 dark:text-brand-300">Abrir →</Link>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
