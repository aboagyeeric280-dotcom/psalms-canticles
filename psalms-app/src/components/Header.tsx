import { IconBack, IconHome, IconMenu, IconSearch, IconSettings } from './icons';

interface Props {
  title: string;
  kicker?: string;
  canGoBack: boolean;
  progress?: number;
  /** Today's rank and vesture, shown as a badge beside the title. */
  rank?: string;
  colour?: string;
  onBack: () => void;
  onMenu: () => void;
  onSearch: () => void;
  onSettings: () => void;
}

/** The bar across the top: where you are, what you are looking for, and what
    is kept today. The menu button only appears below the desktop breakpoint,
    where the sidebar has folded away into a drawer. */
export default function Header({
  title, kicker, canGoBack, progress, rank, colour, onBack, onMenu, onSearch, onSettings,
}: Props) {
  return (
    <header className="hdr">
      <div className="hdr__row">
        <button className="iconbtn hdr__menu" onClick={onMenu} aria-label="Sections">
          <IconMenu />
        </button>
        <button className="iconbtn hdr__back" onClick={onBack} aria-label={canGoBack ? 'Back' : 'Home'}>
          {canGoBack ? <IconBack /> : <IconHome />}
        </button>

        <h1 className="hdr__title">
          {kicker ? <small>{kicker}</small> : null}
          {title}
        </h1>

        <button className="hdr__search" onClick={onSearch}>
          <IconSearch />
          <span>Search psalms and canticles</span>
        </button>

        {rank && (
          <span className="hdr__rank" data-colour={colour}>
            <span className="seasondot" data-colour={colour} aria-hidden="true" />
            {rank}
          </span>
        )}

        <button className="iconbtn hdr__find" onClick={onSearch} aria-label="Find a psalm"><IconSearch /></button>
        <button className="iconbtn" onClick={onSettings} aria-label="Reading settings"><IconSettings /></button>
      </div>
      {progress !== undefined && (
        <div className="progress" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
      )}
    </header>
  );
}
