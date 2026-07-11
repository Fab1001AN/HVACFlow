'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { Spinner } from '@/components/shared';

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.tasks.get(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <TaskDrawer
      taskId={id}
      onClose={() => router.back()}
    />
  );
}
