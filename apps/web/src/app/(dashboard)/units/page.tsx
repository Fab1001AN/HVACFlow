'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/shared';
import { ChevronRight } from 'lucide-react';

export default function UnitsIndexPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Units" description="Units are accessed through their order hierarchy." />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Navigate to an order to view its units.</p>
          <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            View Customers <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
