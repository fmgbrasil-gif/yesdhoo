import { revalidatePath } from 'next/cache';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { isOnline } from '@/lib/util';
import { fileUrl, isBrandLogo, logoOnDark } from '@/lib/storage';
import { refreshNotifications } from '@/lib/notifications';
import { brandCss } from '@/lib/tenant';
import { Sidebar } from '@/components/Sidebar';
import { DevCredit, Watermark } from '@/components/Brand';
import { logout } from '../login/actions';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await refreshNotifications(user.tenantId);
  const [favorites, notifications] = await Promise.all([
    db.screen.findMany({ where: { ...screenScope(user), favorite: true }, orderBy: { name: 'asc' }, take: 8, select: { id: true, name: true, lastSeenAt: true } }),
    db.notification.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  async function markRead() {
    'use server';
    const u = await requireUser();
    await db.notification.updateMany({ where: { tenantId: u.tenantId, read: false }, data: { read: true } });
    revalidatePath('/', 'layout');
  }

  return (
    <div className="lg:flex">
      <style dangerouslySetInnerHTML={{ __html: brandCss(user.tenant.color) }} />
      <Sidebar
        user={{ name: user.name, email: user.email, image: fileUrl(user.image), role: user.role, superAdmin: user.superAdmin }}
        company={{ name: user.tenant.tradeName || user.tenant.name, logo: logoOnDark(fileUrl(user.tenant.logo)), brand: isBrandLogo(user.tenant.logo) }}
        favorites={favorites.map((f) => ({ id: f.id, name: f.name, online: isOnline(f.lastSeenAt) }))}
        notifications={notifications.map((n) => ({ id: n.id, message: n.message, link: n.link, read: n.read }))}
        logout={logout}
        markRead={markRead}
      />
      <Watermark src={fileUrl(user.tenant.logo)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <footer className="flex justify-center border-t border-ink-100 px-4 py-3 print:hidden dark:border-ink-800"><DevCredit /></footer>
      </div>
    </div>
  );
}
