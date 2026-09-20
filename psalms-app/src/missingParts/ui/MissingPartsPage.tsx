import { useAnnouncement } from './announce';
import { useAppState } from '../state/useAppState';
import { dismissSaveError } from '../state/store';
import LibraryScreen from './LibraryScreen';
import ProgressScreen from './ProgressScreen';
import ReviewScreen from './ReviewScreen';

export type MissingPartsTab = 'library' | 'progress' | 'review';

export const MISSING_PARTS_ROUTES: Record<MissingPartsTab, string> = {
  library: '#/missing',
  progress: '#/missing/progress',
  review: '#/missing/review',
};

const TABS: { id: MissingPartsTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'progress', label: 'Progress' },
  { id: 'review', label: 'Review' },
];

/** Which of the three a hash route names. Anything else is the Library. */
export function tabFromRoute(route: string): MissingPartsTab {
  if (route.startsWith(MISSING_PARTS_ROUTES.progress)) return 'progress';
  if (route.startsWith(MISSING_PARTS_ROUTES.review)) return 'review';
  return 'library';
}

interface Props {
  tab: MissingPartsTab;
  onGo: (route: string) => void;
}

/**
 * The three screens for the reader's own material, with local navigation.
 *
 * Kept away from the book's own reader: these are working screens for
 * material the reader wrote, not a text to pray from.
 */
export default function MissingPartsPage({ tab, onGo }: Props) {
  const announcement = useAnnouncement();
  const { saveError, storageAvailable } = useAppState();

  return (
    <div className="shell mp-page">
      <div className="sr" role="status" aria-live="polite" aria-label="Notifications">
        {announcement.message}
      </div>

      <nav className="mp-tabs" aria-label="Your own material">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="mp-tab mp-touch"
            aria-current={tab === item.id ? 'page' : undefined}
            data-current={tab === item.id ? '1' : '0'}
            onClick={() => onGo(MISSING_PARTS_ROUTES[item.id])}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {!storageAvailable ? (
        <p className="mp-error" role="alert">
          This browser is not letting the app save anything, so nothing here can be kept.
        </p>
      ) : null}

      {saveError ? (
        <p className="mp-error" role="alert">
          {saveError}{' '}
          <button type="button" className="btn btn--ghost mp-touch" onClick={dismissSaveError}>
            Dismiss
          </button>
        </p>
      ) : null}

      {tab === 'library' ? <LibraryScreen /> : null}
      {tab === 'progress' ? <ProgressScreen /> : null}
      {tab === 'review' ? <ReviewScreen /> : null}
    </div>
  );
}
