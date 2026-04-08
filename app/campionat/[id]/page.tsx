import { redirect } from 'next/navigation';

export default async function CampionatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/campionat/${id}/jugadors`);
}
