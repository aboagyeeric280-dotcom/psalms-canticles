import { useMemo, useState } from 'react';
import OfficeReader from './OfficeReader';
import type { FocusMark } from './Blocks';
import { complineBlocks, complinePrefix } from '../data/pageBlocks';
import { DAY_KEYS, DAY_NAMES, complineDayKey } from '../utils/liturgicalCalendar';
import type { Block, DayKey } from '../types';
import type { Prefs } from '../utils/storage';
import { liturgicalToday } from '../utils/generalCalendar';
import LiturgicalHeader from './LiturgicalHeader';

interface Props {
  season: string;
  prefs: Prefs;
  onGo: (r: string) => void;
  onProgress: (p: number) => void;
  onSize?: (delta: number) => void;
  onCycleTheme?: () => void;
  latin?: string;
  resumeKey?: string;
  focus?: FocusMark | null;
  /** The evening to open on. Compline follows the clock unless a route — a
      search result, say — names another day. */
  day?: DayKey;
}

/** Compline is the one hour the book prints whole, so the app assembles it
    end to end for the evening in hand. */
export default function ComplineView({
  season, prefs, onGo, onProgress, onSize, onCycleTheme, latin, resumeKey, focus,
  day: asked,
}: Props) {
  const today = useMemo(() => complineDayKey(), []);
  const [day, setDay] = useState<DayKey>(asked ?? today);
  const [solemn, setSolemn] = useState(false);

  const blocks = useMemo<Block[]>(() => complineBlocks(day, solemn), [day, solemn]);

  return (
    <OfficeReader
      kicker="Bedtime Prayer"
      title="Compline"
      subtitle={`${DAY_NAMES[day]}${solemn ? ' · before a solemn feast' : ''} — pages 397–413`}
      blocks={blocks}
      season={season}
      prefs={prefs}
      onGo={onGo}
      onProgress={onProgress}
      onSize={onSize}
      onCycleTheme={onCycleTheme}
      latin={latin}
      resumeKey={resumeKey}
      focus={focus}
      idPrefix={complinePrefix(day, solemn)}
      intro={
        <div className="blk">
          <LiturgicalHeader day={liturgicalToday()} compact />
          <div className="chiprow" style={{ marginBottom: '.6rem' }}>
            {DAY_KEYS.map(d => (
              <button key={d} className="chip" aria-pressed={d === day} onClick={() => setDay(d)}>
                {DAY_NAMES[d].slice(0, 3)}
              </button>
            ))}
          </div>
          <div className="chiprow">
            <button className="chip" aria-pressed={solemn} onClick={() => setSolemn(s => !s)}>
              Solemn feast
            </button>
            <button className="chip" onClick={() => onGo('#/dominican')}>Supplements →</button>
          </div>
          <p className="rubric" style={{ marginTop: '1.2em' }}>
            The psalms, reading and collect below are those the book appoints for this evening.
            The Dominican Confiteor is printed among the opening prayers.
          </p>
        </div>
      }
      outro={
        <section className="blk" style={{ marginTop: '3em' }}>
          <h3 className="h2">Anthem to Our Lady</h3>
          <p className="rubric">
            Compline ends with an anthem — Salve Regina through the year, Regina Caeli in Eastertide.
          </p>
          <button className="btn" onClick={() => onGo('#/dominican')}>Open the Compline Supplements</button>
        </section>
      }
    />
  );
}
