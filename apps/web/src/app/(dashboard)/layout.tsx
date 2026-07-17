'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn, initials } from '@/lib/utils';
import {
  LayoutDashboard, Users, FolderOpen, ShoppingBag, Box, Settings,
  ChevronRight, LogOut, Building2, Sliders, Wrench, ClipboardList,
  BarChart3, Cpu, GitBranch, Tag, Package, ListChecks, Menu, X, CalendarDays, Factory, GripVertical, Eye, ClipboardCheck,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/shop-floor', label: 'Shop Floor Dashboard', icon: LayoutDashboard },
  { href: '/department-work', label: 'Supervisor Dashboard', icon: Factory },
  { href: '/production-calendar', label: 'Production Calendar', icon: CalendarDays },
  { href: '/director-dashboard', label: 'Director Dashboard', icon: BarChart3, permission: 'director:view' },
  { href: '/planner-dashboard', label: 'Planner', icon: ClipboardCheck, permission: 'unit:plan' },
  { href: '/purchasing-dashboard', label: 'Purchasing', icon: Package, permission: 'vendor-part:manage' },
  { href: '/manager-dashboard', label: 'Manager Dashboard', icon: ClipboardList },
  { href: '/engineering-dashboard', label: 'Engineering Dashboard', icon: Wrench },
];

const CONFIG_ITEMS = [
  { href: '/config/general', label: 'General', icon: Sliders },
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
  const { user, isAuthenticated, logout, loadMe, hasPermission, isImpersonating, exitViewAs } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navItems, setNavItems] = useState(NAV_ITEMS);
  const [draggedNavHref, setDraggedNavHref] = useState<string | null>(null);
  const [deptSectionExpanded, setDeptSectionExpanded] = useState(true);
  const [configSectionExpanded, setConfigSectionExpanded] = useState(true);

  useEffect(() => {
    const dept = localStorage.getItem('hvacflow:sidebar-departments-expanded');
    const config = localStorage.getItem('hvacflow:sidebar-config-expanded');
    if (dept !== null) setDeptSectionExpanded(dept === 'true');
    if (config !== null) setConfigSectionExpanded(config === 'true');
  }, []);

  const toggleDeptSection = () => setDeptSectionExpanded((v) => {
    localStorage.setItem('hvacflow:sidebar-departments-expanded', String(!v));
    return !v;
  });
  const toggleConfigSection = () => setConfigSectionExpanded((v) => {
    localStorage.setItem('hvacflow:sidebar-config-expanded', String(!v));
    return !v;
  });

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

  const canManageConfig = hasPermission('config:manage');

  // Admins get a shortcut to every department's live Mission Control
  // board, in department sortOrder - not a separate page per department
  // (that duplicated a lot of UI before), just Mission Control
  // pre-filtered via query param.
  //
  // This MUST be called unconditionally, before the early return below -
  // a hook called only after an early-return guard gets skipped entirely
  // on renders where that guard fires (e.g. while auth is still
  // loading), then gets called on renders where it doesn't. That changes
  // the number/order of hooks between renders, which is exactly what
  // React's "Rendered more hooks than during the previous render" error
  // is about - it was placed after the guard before, which is what
  // caused it.
  const { data: departmentLinks = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list({ isActive: true }),
    enabled: canManageConfig,
    staleTime: 60_000,
  });

  const { data: orgSettings } = useQuery({
    queryKey: ['organization-settings'],
    queryFn: () => api.organizationSettings.get(),
    staleTime: Infinity,
  });
  const orgName = orgSettings?.name ?? 'HVACFlow';

  // The static <title> in the root layout is a build-time default, not
  // something that can read this deployment's chosen name without a
  // server-side fetch - simplest, lowest-risk fix is updating the tab
  // title client-side once the name is actually known. Same pattern as
  // most SPA-style apps use for anything the server can't know ahead of
  // time.
  useEffect(() => {
    if (orgSettings?.name) document.title = orgSettings.name;
  }, [orgSettings?.name]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isConfigActive = pathname.startsWith('/config');
  const visibleNavItems = navItems.filter((item: any) => !item.permission || hasPermission(item.permission));

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
            <span className="font-semibold text-sm text-foreground">{orgName}</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn('ml-auto text-muted-foreground hover:text-foreground transition-colors', !sidebarOpen && 'mx-auto')}
          >
            <ChevronRight className={cn('w-4 h-4 transition-transform', sidebarOpen && 'rotate-180')} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-3 space-y-0.5 px-2">
          {visibleNavItems.map((item) => {
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

          {canManageConfig && departmentLinks.length > 0 && (
            <>
              <button
                onClick={toggleDeptSection}
                className={cn('w-full flex items-center justify-between pt-4 pb-1 px-2', !sidebarOpen && 'hidden')}
              >
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Departments
                </span>
                <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', deptSectionExpanded && 'rotate-90')} />
              </button>
              {!sidebarOpen && <div className="border-t border-border my-2" />}
              {(deptSectionExpanded || !sidebarOpen) && departmentLinks
                .slice()
                .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                .map((dept: any) => {
                  const href = `/shop-floor?departmentId=${dept.id}`;
                  const active = pathname === '/shop-floor' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('departmentId') === dept.id;
                  return (
                    <NavItem
                      key={dept.id}
                      href={href}
                      icon={<div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${dept.color ?? '#6b7280'}22` }}><div className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color ?? '#6b7280' }} /></div>}
                      label={dept.name}
                      active={active}
                      collapsed={!sidebarOpen}
                    />
                  );
                })}
            </>
          )}

          {canManageConfig && (
            <>
              <button
                onClick={toggleConfigSection}
                className={cn('w-full flex items-center justify-between pt-4 pb-1 px-2', !sidebarOpen && 'hidden')}
              >
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Configuration
                </span>
                <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', configSectionExpanded && 'rotate-90')} />
              </button>
              {!sidebarOpen && <div className="border-t border-border my-2" />}
              {(configSectionExpanded || !sidebarOpen) && CONFIG_ITEMS.map((item) => {
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
        <span className="font-semibold text-sm text-foreground">{orgName}</span>
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
            className="w-64 h-full bg-card border-r border-border pt-14 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex-1 min-h-0 overflow-y-auto py-3 space-y-0.5 px-2">
              {visibleNavItems.map((item) => {
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
              {canManageConfig && departmentLinks.length > 0 && (
                <>
                  <button onClick={toggleDeptSection} className="w-full flex items-center justify-between pt-4 pb-1 px-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Departments</span>
                    <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', deptSectionExpanded && 'rotate-90')} />
                  </button>
                  {deptSectionExpanded && departmentLinks
                    .slice()
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((dept: any) => (
                      <NavItem
                        key={dept.id}
                        href={`/shop-floor?departmentId=${dept.id}`}
                        icon={<div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${dept.color ?? '#6b7280'}22` }}><div className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color ?? '#6b7280' }} /></div>}
                        label={dept.name}
                        active={false}
                        collapsed={false}
                        onClick={() => setMobileMenuOpen(false)}
                      />
                    ))}
                </>
              )}
              {canManageConfig && (
                <>
                  <button onClick={toggleConfigSection} className="w-full flex items-center justify-between pt-4 pb-1 px-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configuration</span>
                    <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', configSectionExpanded && 'rotate-90')} />
                  </button>
                  {configSectionExpanded && CONFIG_ITEMS.map((item) => {
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
      <main className="flex-1 min-w-0 overflow-y-auto md:pt-0 pt-14 flex flex-col">
        {isImpersonating && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-500 text-sm">
            <Eye className="w-4 h-4 flex-shrink-0" />
            <span>
              Previewing as <strong>{user.name}</strong> — read-only, no changes will be saved.
            </span>
            <button
              onClick={() => exitViewAs()}
              className="ml-auto flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 transition-colors"
            >
              <LogOut className="w-3 h-3" /> Exit preview
            </button>
          </div>
        )}
        <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
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
