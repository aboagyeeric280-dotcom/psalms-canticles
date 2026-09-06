import type { DayPlan } from '../utils/officeForDay';
import { hourState } from '../utils/hours';

interface Props {
  plan: DayPlan;
  onGo: (route: string) => void;
  /** The hour due about now, so the day can show where it has got to. */
  now?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  psalter: 'Psalter', festal: 'Festal', proper: 'Proper', common: 'Common', none: '—',
};

/** What to pray today, hour by hour, and where each part comes from. */
export default function DayPlanCard({ plan, onGo, now }: Props) {
  return (
    <section className="sect">
      <div className="sect__head">
        <h3 className="sect__title">The office today</h3>
      </div>
      <p className="note" style={{ marginTop: 0 }}>{plan.summary}</p>
      <div className="plan">
        {plan.hours.map(h => (
          <button key={h.hour} className="plan__row" onClick={() => onGo(h.route)}
            data-state={now ? hourState(h.hour, now) : undefined}>
            <span className="plan__tick" aria-hidden="true" />
            <span className="plan__hour">{h.label}</span>
            <span className="plan__what">
              {h.detail}
              {h.caveat && <em className="plan__caveat">{h.caveat}</em>}
            </span>
            <span className="plan__src">{SOURCE_LABEL[h.source]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
