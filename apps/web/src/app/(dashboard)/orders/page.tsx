'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Spinner, Card, ProgressBar } from '@/components/shared';
import { PriorityDot } from '@/components/shared/priority-dot';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

const ORDER_STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Confirmed: 'bg-blue-500/10 text-blue-400',
  InProduction: 'bg-yellow-500/10 text-yellow-400',
  Completed: 'bg-green-500/10 text-green-400',
  Cancelled: 'bg-red-500/10 text-red-400',
};

/**
 * Orders are always accessed through their project hierarchy.
 * This page is here for direct navigation / deep-links.
 * The actual order detail is at /orders/[id].
 */
export default function OrdersIndexPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Orders"
        description="Access orders through a project: Customers → Project → Order"
      />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Navigate to a project to view and manage its orders.
          </p>
          <Link href="/customers"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            View Customers <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
