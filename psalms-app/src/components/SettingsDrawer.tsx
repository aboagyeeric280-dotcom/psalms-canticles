import { useId, type ReactNode } from 'react';
import Sheet from './Sheet';
import type { Prefs } from '../utils/storage';
import { DEFAULT_PREFS } from '../utils/storage';

const STYLES: { id: Prefs['aesthetic']; name: string; hint: string }[] = [
  {
    id: 'vellum', name: 'Vellum & Rubric',
    hint: 'Set like a printed breviary: vermilion rubrics, gold hairlines, a versal at the head of each psalm, and the Latin name of the hour beside the English.',
  },
  {
    id: 'still-point', name: 'Still Point',
    hint: 'Set to get out of the way: a quieter reading face, verse numbers in the margin, and the colour of the day reduced to a single dot.',
  },
  {
    id: 'green-modern', name: 'Green Modern',
    hint: 'A designed scheme rather than a printed one: deep green headers and cards on a cream page, tan buttons, and the psalms set in Cormorant. This is the one style that brings its own colours, so Light and Sepia both show it as drawn and Dark keeps the greens over black.',
  },
];

const FINISHES: { id: Prefs['gloss']; name: string; hint: string }[] = [
  { id: 'matte', name: 'Matte', hint: 'Flat surfaces and plain hairlines. The default.' },
  {
    id: 'glossy', name: 'Glossy & Glass',
    hint: 'Lights the chrome: a gilt specular hairline in Vellum, frosted panels in Still Point, lacquer and bevels in Green Modern. The psalms themselves are never touched — the page under the text stays flat whichever finish is on.',
  },
];

const THEMES: { id: Prefs['theme']; name: string; hint: string }[] = [
  { id: 'light', name: 'Light', hint: 'Clean white' },
  { id: 'sepia', name: 'Sepia', hint: 'Chapel reading' },
  { id: 'dark', name: 'Dark', hint: 'OLED black' },
];

const ANTIPHONS: { id: Prefs['antiphons']; name: string }[] = [
  { id: 'auto', name: 'Follow the calendar' },
  { id: 'all', name: 'Show every season' },
  { id: 'Through the Year', name: 'Through the Year' },
  { id: 'Advent', name: 'Advent' },
  { id: 'Christmastide', name: 'Christmastide' },
  { id: 'Lent', name: 'Lent' },
  { id: 'Holy Week', name: 'Holy Week' },
  { id: 'Eastertide', name: 'Eastertide' },
];

interface Props {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  onClose: () => void;
}

/** A labelled group of controls.

    The label used to be a bare span sitting above a row of chips, which left a
    screen reader reading out eight unrelated toggle buttons with nothing to
    say which setting they belonged to. The row is a group now, named by the
    label it already had. */
function Field({ label, hint, row = 'chiprow', children }: {
  label: string;
  hint?: ReactNode;
  row?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="field__label" id={id}>{label}</span>
      <div className={row} role="group" aria-labelledby={id}>{children}</div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

export default function SettingsDrawer({ prefs, update, onClose }: Props) {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  return (
    <Sheet title="Reading settings" onClose={onClose}>
      <Field label="Prayer book style" hint={STYLES.find(s => s.id === prefs.aesthetic)?.hint}>
        {STYLES.map(s => (
          <button key={s.id} className="chip" aria-pressed={prefs.aesthetic === s.id}
            onClick={() => update({ aesthetic: s.id })}>
            {s.name}
          </button>
        ))}
      </Field>

      <Field label="Chrome finish" hint={FINISHES.find(g => g.id === prefs.gloss)?.hint}>
        {FINISHES.map(g => (
          <button key={g.id} className="chip" aria-pressed={prefs.gloss === g.id}
            onClick={() => update({ gloss: g.id })}>
            {g.name}
          </button>
        ))}
      </Field>

      <Field label="Theme" hint={THEMES.find(t => t.id === prefs.theme)?.hint}>
        {THEMES.map(t => (
          <button key={t.id} className="chip" aria-pressed={prefs.theme === t.id}
            onClick={() => update({ theme: t.id })}>
            {t.name}
          </button>
        ))}
      </Field>

      <Field label="Typeface" row="segmented">
        <button aria-pressed={prefs.font === 'serif'} onClick={() => update({ font: 'serif' })}>Serif</button>
        <button aria-pressed={prefs.font === 'sans'} onClick={() => update({ font: 'sans' })}>Sans</button>
      </Field>

      <Field label="Text size" row="stepper">
        <button className="stepbtn" onClick={() => update({ size: clamp(prefs.size - 1, 14, 30) })}
          aria-label="Smaller text">A−</button>
        <span className="stepper__val" aria-live="polite">{prefs.size} px</span>
        <button className="stepbtn" onClick={() => update({ size: clamp(prefs.size + 1, 14, 30) })}
          aria-label="Larger text">A+</button>
      </Field>

      <Field label="Line height" row="stepper">
        <button className="stepbtn" onClick={() => update({ leading: clamp(+(prefs.leading - 0.1).toFixed(1), 1.2, 2.4) })}
          aria-label="Tighter lines">−</button>
        <span className="stepper__val" aria-live="polite">{prefs.leading.toFixed(1)}</span>
        <button className="stepbtn" onClick={() => update({ leading: clamp(+(prefs.leading + 0.1).toFixed(1), 1.2, 2.4) })}
          aria-label="Looser lines">+</button>
      </Field>

      <Field
        label="Antiphons"
        hint="The book prints every season’s antiphon together. Choosing a season keeps the others out of the way; they are never removed from the text."
      >
        {ANTIPHONS.map(a => (
          <button key={a.id} className="chip" aria-pressed={prefs.antiphons === a.id}
            onClick={() => update({ antiphons: a.id })}>
            {a.name}
          </button>
        ))}
      </Field>

      <Field
        label="Chanting aids"
        hint="A line space in the book means the singing changes sides; an accent means the pitch changes, according to the psalm tone."
      >
        <button className="chip" aria-pressed={prefs.choir} onClick={() => update({ choir: !prefs.choir })}>
          Mark the two choirs
        </button>
        <button className="chip" aria-pressed={prefs.tones} onClick={() => update({ tones: !prefs.tones })}>
          Show pitch accents
        </button>
      </Field>

      <Field
        label="Colour of the day"
        hint="The rule beside each antiphon takes the vesture colour of the day: green through the year, violet in Advent and Lent, red for the martyrs. Turned off, it stays the crimson that the book prints its rubrics in."
      >
        <button className="chip" aria-pressed={prefs.litColour}
          onClick={() => update({ litColour: !prefs.litColour })}>
          Mark the antiphons in the colour of the day
        </button>
      </Field>

      <button className="btn btn--ghost" onClick={() => update(DEFAULT_PREFS)}>Reset to defaults</button>
    </Sheet>
  );
}
