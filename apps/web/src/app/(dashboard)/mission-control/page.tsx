import { redirect } from 'next/navigation';

// Renamed to Shop Floor Dashboard - redirect in case anyone has this
// URL bookmarked, or old links from before the rename are still around.
export default function MissionControlRedirect() {
  redirect('/shop-floor');
}
