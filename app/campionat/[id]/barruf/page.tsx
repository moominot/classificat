import BarrufClient from '@/components/forms/BarrufClient';

export const dynamic = 'force-dynamic';

export default async function BarrufPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BarrufClient tournamentId={id} />;
}
