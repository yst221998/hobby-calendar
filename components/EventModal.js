import styles from './EventModal.module.css'

const PLATFORM_ICONS = {
  'BookMyShow': '🎟️',
  'District': '🏙️',
}

export default function EventModal({
  event,
  onClose,
  isSaved = false,
  onToggleSave,
  saveLoading = false,
  authConfigured = false,
}) {
  if (!event) return null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <div className={styles.header}>
          {event.source === 'real' && <span className={styles.realBadge}>Live Event</span>}
          {event.source === 'partial' && <span className={styles.browseBadge}>Browse on platform</span>}
          {event.day === null && <span className={styles.tbdBadge}>Date TBD</span>}
          <h2 className={styles.title}>{event.name}</h2>
          <div className={styles.meta}>
            <span>📍 {event.venue}</span>
            <span>🕐 {event.time}</span>
            <span>💰 {event.price}</span>
          </div>
          <span className={styles.hobbyTag}>{event.hobby}</span>
        </div>

        {authConfigured && onToggleSave && (
          <button
            type="button"
            className={isSaved ? styles.savedBtn : styles.interestedBtn}
            onClick={onToggleSave}
            disabled={saveLoading}
          >
            {saveLoading ? 'Saving…' : isSaved ? '✓ Saved' : '★ Interested'}
          </button>
        )}

        <div className={styles.bookSection}>
          <p className={styles.bookLabel}>Book your spot</p>
          <div className={styles.links}>
            {event.platforms && event.platforms.map(platform => (
              <a
                key={platform}
                href={event.bookingLinks?.[platform] || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <span className={styles.platformIcon}>{PLATFORM_ICONS[platform] || '🔗'}</span>
                <div>
                  <div className={styles.platformName}>{platform}</div>
                  <div className={styles.platformSub}>Tap to open & book</div>
                </div>
                <span className={styles.arrow}>→</span>
              </a>
            ))}
          </div>
        </div>

        <button className={styles.closeFullBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
