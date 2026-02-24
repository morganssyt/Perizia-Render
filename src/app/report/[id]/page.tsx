import { redirect } from 'next/navigation';
export default function ReportRedirect({ params }: { params: { id: string } }) {
  redirect(`/app/report/${params.id}`);
}
