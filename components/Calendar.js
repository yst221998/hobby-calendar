import styles from './Calendar.module.css'

const { getCityLabel } = require('../lib/eventCity')
const { eventTooltip } = require('../lib/eventDisplay')

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const HOBBY_COLORS = {
  'Music': 'purple',
  'Art & Craft': 'coral',
  'Photography': 'teal',
  'Fitness': 'gold',
  'Comedy': 'purple',
  'Theatre': 'coral',
  'Food & Dining': 'gold',
  'Dance': 'purple',
  'Hiking': 'teal',
  'Wellness': 'teal',
  'Tech & Gaming': 'teal',
  'Books & Literature': 'coral',
  'Movies/Cinema': 'purple',
  Cinema: 'purple',
  'Wine & Cocktails': 'gold',
  Dating: 'coral',
  Yoga: 'teal',
  'Stand-up Comedy': 'purple',
}

function getColor(hobby) {
  return HOBBY_COLORS[hobby] || 'gold'
}

export default function Calendar({ events, month, year, onMonthChange, onEventClick, onMoreClick }) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const eventsByDay = {}
  events.forEach(e => {
    if (!eventsByDay[e.day]) eventsByDay[e.day] = []
    eventsByDay[e.day].push(e)
  })

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className={styles.wrapper}>
      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={() => onMonthChange(-1)}>←</button>
        <span className={styles.monthTitle}>{MONTHS[month]} {year}</span>
        <button className={styles.navBtn} onClick={() => onMonthChange(1)}>→</button>
      </div>

      <div className={styles.dayLabels}>
        {DAYS.map((d, i) => (
          <div key={d + i} className={styles.dayLabel}>
            <span className={styles.dayLabelFull}>{d}</span>
            <span className={styles.dayLabelShort}>{DAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>

      <div className={styles.gridWrap}>
        <div className={styles.grid}>
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className={styles.emptyCell} />
            const dayEvents = eventsByDay[day] || []
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            return (
              <div key={day} className={`${styles.cell} ${dayEvents.length ? styles.hasEvents : ''} ${isToday ? styles.today : ''}`}>
                <div className={styles.dateNum}>{day}</div>
                {dayEvents.slice(0, 2).map((ev, ei) => (
                  <button
                    key={ei}
                    className={`${styles.eventPill} ${styles[getColor(ev.hobby)]}`}
                    title={eventTooltip(ev)}
                    onClick={() => onEventClick(ev)}
                  >
                    <span className={styles.eventCity}>{getCityLabel(ev.normalizedCity) || 'Unverified'}</span>
                    <span className={styles.eventName}>{ev.name}</span>
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <button className={styles.moreBtn} onClick={() => onMoreClick(dayEvents)}>
                    +{dayEvents.length - 2} more
                  </button>
                )}
                {dayEvents.length === 2 && (
                  <button className={`${styles.moreBtn} ${styles.moreBtnMobile}`} onClick={() => onMoreClick(dayEvents)}>
                    +1 more
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
