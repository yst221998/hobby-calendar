import styles from './SavedEventsPanel.module.css'

const { getCityLabel } = require('../lib/eventCity')

export default function SavedEventsPanel({ events, onEventClick, onClose }) {
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Saved events</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {events.length === 0 ? (
          <div className={styles.empty}>
            <p>No saved events yet.</p>
            <p className={styles.emptySub}>Tap “Interested” on any event to save it here.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {events.map((ev, i) => {
              const link = ev.bookingLinks ? Object.values(ev.bookingLinks)[0] : ''
              return (
                <button
                  key={`${link}-${ev.day ?? 'tbd'}-${i}`}
                  type="button"
                  className={styles.row}
                  onClick={() => onEventClick(ev)}
                >
                  <span className={styles.icon}>{ev.platformIcon || '📅'}</span>
                  <div className={styles.info}>
                    <p className={styles.name}>{ev.name}</p>
                    <p className={styles.meta}>
                      {getCityLabel(ev.normalizedCity) || 'Location not verified'} · {ev.hobby} · {ev.platforms?.[0]} · {ev.day ? `Day ${ev.day}` : 'Date TBD'}
                    </p>
                  </div>
                  <span className={styles.arrow}>→</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
