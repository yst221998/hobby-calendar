import styles from './DayEventsModal.module.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function DayEventsModal({ events, day, month, year, onClose, onEventClick }) {
  if (!events || events.length === 0) return null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>All events</p>
            <h3 className={styles.title}>{MONTHS[month]} {day}, {year}</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.list}>
          {events.map((ev, i) => (
            <button
              key={i}
              className={styles.eventRow}
              onClick={() => { onClose(); onEventClick(ev); }}
            >
              <span className={styles.icon}>{ev.platformIcon || '📅'}</span>
              <div className={styles.info}>
                <p className={styles.name}>{ev.name}</p>
                <p className={styles.meta}>{ev.time} · {ev.venue}</p>
              </div>
              <div className={styles.right}>
                <span className={styles.price}>{ev.price}</span>
                <span className={styles.arrow}>→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
