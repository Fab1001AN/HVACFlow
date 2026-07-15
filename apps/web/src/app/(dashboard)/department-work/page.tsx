import { redirect } from 'next/navigation';

// Department Work was retired in favor of Mission Control, which does
// the same job better (real-time updates, station-level grouping,
// proper checklist handling, department-scoped by permission). Redirect
// rather than 404 in case anyone has this URL bookmarked.
export default function DepartmentWorkRedirect() {
  redirect('/mission-control');
}
