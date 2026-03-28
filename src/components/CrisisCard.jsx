import './CrisisCard.css'

// Resources are hardcoded — never sourced from AI output.
// 988 is the US national crisis line. Campus numbers are GSU-specific.
const RESOURCES = [
  {
    key: '988',
    name: '988 Suicide & Crisis Lifeline',
    detail: 'Call or text — free, confidential, 24/7',
    href: 'tel:988',
    cta: 'Tap to Call 988',
    primary: true,
  },
  {
    key: 'text',
    name: 'Crisis Text Line',
    detail: 'Text HOME to 741741 — silent, immediate support',
    href: 'sms:741741?body=HOME',
    cta: 'Tap to Text',
    primary: false,
  },
  {
    key: 'police',
    name: 'GSU Campus Police',
    detail: '404-413-5717 — on-campus emergencies, 24/7',
    href: 'tel:+14044135717',
    cta: 'Tap to Call',
    primary: false,
  },
  {
    key: 'counseling',
    name: 'GSU Counseling Services',
    detail: 'Walk-ins welcome — 404-413-1640',
    href: 'tel:+14044131640',
    cta: 'Tap to Call',
    primary: false,
  },
]

/**
 * CrisisCard — rendered whenever the backend signals requiresEscalation: true.
 *
 * Props:
 *   onDismiss — optional callback rendered as a small "I'm safe" link at the bottom.
 *               When absent the card is non-dismissable (e.g. as a full panel replacement).
 */
export default function CrisisCard({ onDismiss }) {
  return (
    <div className="crisis-card" role="alert" aria-live="assertive">
      <div className="crisis-header">
        <div className="crisis-icon" aria-hidden="true">🤝</div>
        <h2 className="crisis-headline">You matter. Help is here.</h2>
        <p className="crisis-sub">
          These services are free, confidential, and available right now.
        </p>
      </div>

      <div className="crisis-resources">
        {RESOURCES.map(r => (
          <a
            key={r.key}
            href={r.href}
            className={`crisis-btn${r.primary ? ' crisis-btn-primary' : ' crisis-btn-secondary'}`}
            // rel not needed for tel:/sms: but keeps lint happy
            aria-label={`${r.name} — ${r.detail}`}
          >
            <div className="crisis-btn-body">
              <span className="crisis-btn-name">{r.name}</span>
              <span className="crisis-btn-detail">{r.detail}</span>
            </div>
            <span className="crisis-btn-cta" aria-hidden="true">{r.cta} →</span>
          </a>
        ))}
      </div>

      {onDismiss && (
        <button
          className="crisis-dismiss"
          onClick={onDismiss}
          aria-label="I am safe — dismiss crisis resources"
        >
          I'm safe — go back
        </button>
      )}
    </div>
  )
}
