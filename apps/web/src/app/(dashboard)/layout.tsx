'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { cn, initials } from '@/lib/utils';
import {
  LayoutDashboard, Users, FolderOpen, ShoppingBag, Box, Settings,
  ChevronRight, LogOut, Building2, Sliders, Wrench, ClipboardList,
  BarChart3, Cpu, GitBranch, Tag, Package, ListChecks, Menu, X, CalendarDays, Factory, GripVertical,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/production-calendar', label: 'Production Calendar', icon: CalendarDays },
  { href: '/director-dashboard', label: 'Director Dashboard', icon: BarChart3 },
  { href: '/manager-dashboard', label: 'Manager Dashboard', icon: ClipboardList },
  { href: '/engineering-dashboard', label: 'Engineering Manager', icon: Wrench },
  { href: '/department-work', label: 'Department Work', icon: Factory },
];

const CONFIG_ITEMS = [
  { href: '/config/departments', label: 'Departments', icon: Building2 },
  { href: '/config/priority-levels', label: 'Priority Levels', icon: Tag },
  { href: '/config/processes', label: 'Processes', icon: Cpu },
  { href: '/config/routes', label: 'Process Routes', icon: GitBranch },
  { href: '/config/unit-types', label: 'Unit Types', icon: Box },
  { href: '/config/part-types', label: 'Part Types', icon: Package },
  { href: '/config/composition', label: 'Unit Composition', icon: Sliders },
  { href: '/config/checklists', label: 'Checklists', icon: ListChecks },
  { href: '/config/machines', label: 'Machines', icon: Wrench },
  { href: '/config/roles', label: 'Roles & Permissions', icon: ClipboardList },
  { href: '/config/users', label: 'Users', icon: Users },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout, loadMe, hasPermission } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navItems, setNavItems] = useState(NAV_ITEMS);
  const [draggedNavHref, setDraggedNavHref] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('hvacflow:nav-order');
    if (!saved) return;
    try {
      const order = JSON.parse(saved) as string[];
      const ordered = order.map((href) => NAV_ITEMS.find((item) => item.href === href)).filter(Boolean) as typeof NAV_ITEMS;
      const missing = NAV_ITEMS.filter((item) => !order.includes(item.href));
      setNavItems([...ordered, ...missing]);
    } catch {
      localStorage.removeItem('hvacflow:nav-order');
    }
  }, []);

  const moveNavItem = (targetHref: string) => {
    if (!draggedNavHref || draggedNavHref === targetHref) return;
    setNavItems((current) => {
      const next = [...current];
      const fromIndex = next.findIndex((item) => item.href === draggedNavHref);
      const toIndex = next.findIndex((item) => item.href === targetHref);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      localStorage.setItem('hvacflow:nav-order', JSON.stringify(next.map((item) => item.href)));
      return next;
    });
    setDraggedNavHref(null);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (!user) {
      loadMe();
    }
  }, [isAuthenticated, user, router, loadMe]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const canManageConfig = hasPermission('config:manage');
  const isConfigActive = pathname.startsWith('/config');

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ─── Desktop Sidebar ─────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 flex-shrink-0',
          sidebarOpen ? 'w-56' : 'w-14',
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-border h-14">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Box className="w-4 h-4 text-primary-foreground" />
          </div>
          {sidebarOpen && (
            <span className="font-semibold text-sm text-foreground">HVACFlow</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn('ml-auto text-muted-foreground hover:text-foreground transition-colors', !sidebarOpen && 'mx-auto')}
          >
            <ChevronRight className={cn('w-4 h-4 transition-transform', sidebarOpen && 'rotate-180')} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <div
                key={item.href}
                draggable={sidebarOpen}
                onDragStart={() => setDraggedNavHref(item.href)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveNavItem(item.href)}
                onDragEnd={() => setDraggedNavHref(null)}
                className={cn('flex items-center rounded-md', draggedNavHref === item.href && 'opacity-40')}
              >
                {sidebarOpen && <GripVertical className="w-3.5 h-3.5 ml-1 text-muted-foreground cursor-grab flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <NavItem href={item.href} icon={<Icon className="w-4 h-4" />} label={item.label} active={active} collapsed={!sidebarOpen} />
                </div>
              </div>
            );
          })}

          {canManageConfig && (
            <>
              <div className={cn('pt-4 pb-1 px-2', !sidebarOpen && 'hidden')}>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Configuration
                </span>
              </div>
              {!sidebarOpen && <div className="border-t border-border my-2" />}
              {CONFIG_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={<Icon className="w-4 h-4" />}
                    label={item.label}
                    active={active}
                    collapsed={!sidebarOpen}
                  />
                );
              })}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-2">
          <div className={cn('flex items-center gap-2 rounded-md p-2', sidebarOpen && 'hover:bg-accent')}>
            <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium flex-shrink-0">
              {initials(user.name)}
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Mobile Header ────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-14 bg-card border-b border-border">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <Box className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm text-foreground">HVACFlow</span>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-background/80 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 h-full bg-card border-r border-border pt-14"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={<Icon className="w-4 h-4" />}
                    label={item.label}
                    active={active}
                    collapsed={false}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                );
              })}
              {canManageConfig && (
                <>
                  <div className="pt-4 pb-1 px-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configuration</span>
                  </div>
                  {CONFIG_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        icon={<Icon className="w-4 h-4" />}
                        label={item.label}
                        active={active}
                        collapsed={false}
                        onClick={() => setMobileMenuOpen(false)}
                      />
                    );
                  })}
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ─── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors group',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        collapsed && 'justify-center px-2',
      )}
    >
      <span className={cn('flex-shrink-0', active ? 'text-primary' : '')}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
