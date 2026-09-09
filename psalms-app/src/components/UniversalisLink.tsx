import { useEffect, useState } from 'react';
import type { HourKey } from '../types';
import { dayOfHour, outsideWindow, universalisUrlFor } from '../utils/universalis';

/* The foot of the Hour: a way through to the parts our book does not print.

   Our book carries the psalmody. The short reading, the responsory, the
   intercessions and the concluding prayer are not in it, and their English
   translations are under copyright we do not hold — so the app links to them
   instead of carrying them. Nothing is fetched, stored or republished here;
   this is an anchor tag and a date. See utils/universalis.ts.

   It is set as a footer and not as a section of the Office, because that is
   what it is: the liturgical text ends above it.                          */

/** What to call each hour in the link, in the reader's own English. */
const HOUR_LABELS: Record<HourKey, string> = {
  morning: 'Morning Prayer',
  midday: 'Midday Prayer',
  evening: 'Evening Prayer',
  // Universalis print this under the Saturday; it belongs to the Sunday.
  'evening-before': 'Evening Prayer I',
};

/** The day named in the link. The year is given only when it is not this one,
    which is the case the reader would otherwise have to work out. */
function nameDay(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Whether the browser believes it has a connection.

    Read from `navigator.onLine`, which costs nothing and asks nothing of the
    network — the offline guarantee is untouched. It is only ever used to say
    something plain to the reader; the link is never taken away, because a
    browser that reports itself offline is not always right. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

interface Props {
  hour: HourKey;
  /** The calendar day the reader is praying on — the date the app is showing. */
  prayedOn: Date;
}

export default function UniversalisLink({ hour, prayedOn }: Props) {
  const online = useOnline();
  const day = dayOfHour(hour, prayedOn);
  const url = universalisUrlFor(hour, prayedOn);
  const far = outsideWindow(prayedOn);

  return (
    <section className="uxl" aria-labelledby="uxl-h">
      <h2 className="uxl__head" id="uxl-h">The rest of the Hour</h2>

      <p className="uxl__lead">
        Our book prints the psalmody only. The short reading, responsory,
        intercessions and concluding prayer for this Hour are on the Universalis
        website, at <span className="uxl__host">universalis.com</span>.
      </p>

      {!online && (
        <p className="uxl__note" role="status">
          You are offline. Everything above is in the app and stays there; this
          one link needs a connection.
        </p>
      )}

      <a className="uxl__link" href={url} target="_blank" rel="noopener noreferrer">
        Open {HOUR_LABELS[hour]} for {nameDay(day)} at Universalis<span
          className="uxl__out" aria-hidden="true">↗</span>
      </a>

      {far && (
        <p className="uxl__note">
          The free website carries about a week ahead; for a date this far off it
          may open on today’s Hour instead.
        </p>
      )}

      <p className="rubric uxl__rubric">
        The psalms there are Universalis’s own translation from the Latin, not
        the liturgical one. The psalms to pray are the ones printed in this
        book, above.
      </p>
    </section>
  );
}
