import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/production-calendar');
}
