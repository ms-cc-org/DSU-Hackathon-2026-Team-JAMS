'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LAST_DAY, LAST_OBSERVED_DAY, formatDay, parseIsoDay, dayOf } from '@/lib/daily';

/** On Predict, says which date someone asked for when they typed one past the records. */
export default function PredictDateNote() {
  const iso = useSearchParams().get('date');
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = dayOf(+m[1], +m[2], +m[3]);
  if (day <= LAST_DAY || parseIsoDay(iso) == null) return null;
  return (
    <p className="predict-note" role="status">
      You asked for <b>{formatDay(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</b>.
      Agrigine’s records end on {formatDay(LAST_OBSERVED_DAY, { month: 'long', day: 'numeric', year: 'numeric' })} and its predictions run to {formatDay(LAST_DAY, { month: 'long', day: 'numeric', year: 'numeric' })}; dates after that aren’t predicted yet.
      {' '}<Link href="/">Back to Explore</Link>
    </p>
  );
}
