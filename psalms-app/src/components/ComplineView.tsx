import { useMemo, useState } from 'react';
import OfficeReader from './OfficeReader';
import compline from '../data/compline.json';
import { DAY_KEYS, DAY_NAMES, complineDayKey } from '../utils/liturgicalCalendar';
import type { Block, DayKey } from '../types';
import type { Prefs } from '../utils/storage';
import { liturgicalToday } from '../utils/generalCalendar';
import LiturgicalHeader from './LiturgicalHeader';

interface Data {
  opening: Block[];
  days: { key: DayKey; title: string; blocks: Block[] }[];
  readings: { key: string; day: string; ref: string; blocks: Block[] }[];
  responsory: Block[];
  simeon: Block[];
  collects: { key: string; blocks: Block[] }[];
  blessing: Block[];
  supplementary: Block[];
}
const C = compline as unknown as Data;

const COLLECT_KEY: Record<DayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

interface Props {
  season: string;
  prefs: Prefs;
  onGo: (r: string) => void;
  onProgress: (p: number) => void;
  onSize?: (delta: number) => void;
  onCycleTheme?: () => void;
  latin?: string;
  resumeKey?: string;
}

/** Compline is the one hour the book prints whole, so the app assembles it
    end to end for the evening in hand. */
export default function ComplineView({
  season, prefs, onGo, onProgress, onSize, onCycleTheme, latin, resumeKey,
}: Props) {
  const today = useMemo(() => complineDayKey(), []);
  const [day, setDay] = useState<DayKey>(today);
  const [solemn, setSolemn] = useState(false);

  const blocks = useMemo<Block[]>(() => {
    const psalmSetKey: DayKey = solemn ? (day === 'sat' ? 'sat' : 'sun') : day;
    const psalms = C.days.find(d => d.key === psalmSetKey)?.blocks ?? [];
    const reading = C.readings.find(r => r.key === day.toLowerCase());
    const collect = C.collects.find(c => c.key === (solemn ? 'Solemn Feasts' : COLLECT_KEY[day]))
      ?? C.collects.find(c => c.key === COLLECT_KEY[day]);

    const head = (text: string): Block => ({ k: 'head', text, level: 1 });

    return [
      head('Opening Prayers'),
      ...C.opening,
      head('Psalmody'),
      ...psalms,
      head('Short Reading'),
      ...(reading
        ? [{ k: 'reading', day: reading.day, ref: reading.ref } as Block, ...reading.blocks]
        : []),
      head('Responsory'),
      ...C.responsory,
      head('Canticle of Simeon'),
      ...C.simeon,
      head('Prayer'),
      ...(collect?.blocks ?? []),
      head('Blessing'),
      ...C.blessing,
    ];
  }, [day, solemn]);

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
      idPrefix={`compline-${day}-${solemn ? 's' : 'f'}`}
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
