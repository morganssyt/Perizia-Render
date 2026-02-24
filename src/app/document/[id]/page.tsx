import { redirect } from 'next/navigation';

// This route is not used in the current MVP — redirect to home.
export default function DocumentPage() {
  redirect('/');
}
