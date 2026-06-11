import styles from './EventModal.module.css'

const PLATFORM_ICONS = {
  'BookMyShow': '🎟️',
  'Insider.in': '⭐',
  'District': '🏙️',
  'Dineout': '🍽️',
  'Cult.fit': '🏃',
  'Google Events': '🔍',
  'Paytm': '💳',
  'Meetup': '👥',
}

export default function EventModal({ event, onClose }) {
  if (!event) return null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <div className={styles.header}>
          {event.source === 'real' && <span className={styles.realBadge}>Live Event</span>}
          {event.source === 'ai' && <span className={styles.aiBadge}>AI Suggested</span>}
          <h2 className={styles.title}>{event.name}</h2>
          <div className={styles.meta}>
            <span>📍 {event.venue}</span>
            <span>🕐 {event.time}</span>
            <span>💰 {event.price}</span>
          </div>
          <span className={styles.hobbyTag}>{event.hobby}</span>
        </div>

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
