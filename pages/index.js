import { useState, useCallback, useMemo } from 'react'
import Head from 'next/head'
import HobbyPicker from '../components/HobbyPicker'
import Calendar from '../components/Calendar'
import EventModal from '../components/EventModal'
import DayEventsModal from '../components/DayEventsModal'
import styles from './index.module.css'

const STEPS = { INPUT: 'input', LOADING: 'loading', CALENDAR: 'calendar' }

export default function Home() {
  const [step, setStep] = useState(STEPS.INPUT)
  const [hobbies, setHobbies] = useState([])
  const [location, setLocation] = useState('')
  const [eventCache, setEventCache] = useState({})
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [dayEvents, setDayEvents] = useState(null)
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [error, setError] = useState('')
  const [monthError, setMonthError] = useState('')
  const [loadingMsg, setLoadingMsg] = useState('')
  const [eventSources, setEventSources] = useState([])
  const [monthLoading, setMonthLoading] = useState(false)

  const scheduledEvents = useMemo(() => events.filter(e => e.day !== null), [events])
  const unscheduledEvents = useMemo(() => events.filter(e => e.day === null), [events])

  const LOADING_MSGS = [
    'Searching BookMyShow & District…',
    'Matching your interests in Mumbai…',
    'Pulling booking links…',
    'Building your calendar…',
  ]

  const fetchEvents = useCallback(async (m, y, currentHobbies, currentLocation, cache) => {
    const cacheKey = `${m}-${y}`
    if (cache[cacheKey]) return { events: cache[cacheKey], fromCache: true }

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hobbies: currentHobbies, city: currentLocation || 'Mumbai', month: m, year: y }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return { events: data.events || [], fromCache: false }
  }, [])

  const handleFind = async () => {
    if (hobbies.length === 0) { setError('Please pick at least one hobby.'); return }
    setError('')
    setMonthError('')
    setStep(STEPS.LOADING)

    let msgIndex = 0
    setLoadingMsg(LOADING_MSGS[0])
    const interval = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, LOADING_MSGS.length - 1)
      setLoadingMsg(LOADING_MSGS[msgIndex])
    }, 1500)

    try {
      const cacheKey = `${month}-${year}`
      const result = await fetchEvents(month, year, hobbies, location, {})
      clearInterval(interval)
      const newCache = { [cacheKey]: result.events }
      setEventCache(newCache)
      setEvents(result.events)
      setEventSources(['BookMyShow', 'District'])
      setStep(STEPS.CALENDAR)
    } catch (e) {
      clearInterval(interval)
      setError(e.message || 'Something went wrong. Check SERPAPI_KEY in .env.local')
      setStep(STEPS.INPUT)
    }
  }

  const handleMonthChange = async (dir) => {
    let m = month + dir
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
    setMonthError('')

    const cacheKey = `${m}-${y}`
    if (eventCache[cacheKey]) {
      setEvents(eventCache[cacheKey])
      return
    }

    setMonthLoading(true)
    try {
      const result = await fetchEvents(m, y, hobbies, location, eventCache)
      setEventCache(prev => ({ ...prev, [cacheKey]: result.events }))
      setEvents(result.events)
      setEventSources(['BookMyShow', 'District'])
    } catch (e) {
      setMonthError(e.message || 'Failed to load events for this month.')
    } finally {
      setMonthLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Hobby Calendar — Mumbai Events</title>
        <meta name="description" content="Discover events and activities in Mumbai tailored to your hobbies" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.logo}>
              <span className={styles.logoMark}>◆</span>
              <span className={styles.logoText}>HobbyMap</span>
            </div>
            {step === STEPS.CALENDAR && (
              <button className={styles.resetBtn} onClick={() => { setStep(STEPS.INPUT); setEvents([]) }}>
                ← Change hobbies
              </button>
            )}
          </div>
        </header>

        <main className={styles.main}>

          {step === STEPS.INPUT && (
            <div className={styles.inputSection}>
              <div className={styles.hero}>
                <p className={styles.heroEyebrow}>Mumbai · Events · Just for you</p>
                <h1 className={styles.heroTitle}>What do you love doing?</h1>
                <p className={styles.heroSub}>Pick your interests and we&apos;ll fill your calendar with bookable events from BookMyShow and District.</p>
              </div>

              <div className={styles.card}>
                <label className={styles.fieldLabel}>Your interests</label>
                <HobbyPicker selected={hobbies} onChange={setHobbies} />
              </div>

              <div className={styles.card}>
                <label className={styles.fieldLabel}>Your area in Mumbai</label>
                <input
                  type="text"
                  placeholder="e.g. Bandra, Andheri, Lower Parel (optional)"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFind()}
                />
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button
                className={styles.findBtn}
                onClick={handleFind}
                disabled={hobbies.length === 0}
              >
                Build my calendar →
              </button>

              <p className={styles.hint}>Powered by BookMyShow &amp; District via SerpAPI</p>
            </div>
          )}

          {step === STEPS.LOADING && (
            <div className={styles.loadingSection}>
              <div className={styles.loadingSpinner}>
                <div className={styles.spinnerRing}></div>
                <span className={styles.spinnerIcon}>◆</span>
              </div>
              <p className={styles.loadingMsg}>{loadingMsg}</p>
              <div className={styles.loadingTags}>
                {hobbies.map(h => <span key={h} className={styles.loadingTag}>{h}</span>)}
              </div>
            </div>
          )}

          {step === STEPS.CALENDAR && (
            <div className={styles.calendarSection}>
              <div className={styles.calendarHeader}>
                <div>
                  <h2 className={styles.calendarTitle}>Your events calendar</h2>
                  <p className={styles.calendarSub}>
                    {events.length} events · {scheduledEvents.length} dated · {hobbies.join(', ')} · {location || 'Mumbai'}
                  </p>
                  {eventSources.length > 0 && (
                    <p className={styles.sourcesList}>From: {eventSources.join(' · ')}</p>
                  )}
                </div>
                <div className={styles.legend}>
                  {hobbies.slice(0, 4).map((h, i) => (
                    <span key={h} className={`${styles.legendDot} ${styles['dot' + i]}`}>{h}</span>
                  ))}
                </div>
              </div>

              {monthError && (
                <p className={styles.error}>{monthError}</p>
              )}

              {monthLoading ? (
                <div className={styles.monthLoading}>
                  <div className={styles.spinnerRing}></div>
                  <p>Fetching events for this month…</p>
                </div>
              ) : events.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.emptyIcon}>🔍</p>
                  <h3>No events found this month</h3>
                  <p>We search BookMyShow and District for your hobbies. Try a different month or adjust your interests.</p>
                  <button className={styles.resetBtn} onClick={() => { setStep(STEPS.INPUT); setEvents([]); setEventCache({}) }}>Try different hobbies</button>
                </div>
              ) : (
                <>
                  {scheduledEvents.length > 0 && (
                    <Calendar
                      events={scheduledEvents}
                      month={month}
                      year={year}
                      onMonthChange={handleMonthChange}
                      onEventClick={setSelectedEvent}
                      onMoreClick={(evs) => setDayEvents(evs)}
                    />
                  )}

                  {scheduledEvents.length === 0 && unscheduledEvents.length > 0 && (
                    <div className={styles.noDatedNotice}>
                      <p>No dated events this month — see listings below with dates TBD.</p>
                      <div className={styles.monthNavOnly}>
                        <button className={styles.navBtn} onClick={() => handleMonthChange(-1)}>← Prev month</button>
                        <button className={styles.navBtn} onClick={() => handleMonthChange(1)}>Next month →</button>
                      </div>
                    </div>
                  )}

                  {unscheduledEvents.length > 0 && (
                    <section className={styles.tbdSection}>
                      <h3 className={styles.tbdTitle}>Dates TBD this month</h3>
                      <p className={styles.tbdSub}>{unscheduledEvents.length} event{unscheduledEvents.length !== 1 ? 's' : ''} without a confirmed date</p>
                      <div className={styles.tbdList}>
                        {unscheduledEvents.map((ev, i) => (
                          <button
                            key={i}
                            className={styles.tbdRow}
                            onClick={() => setSelectedEvent(ev)}
                          >
                            <span className={styles.tbdIcon}>{ev.platformIcon || '📅'}</span>
                            <div className={styles.tbdInfo}>
                              <p className={styles.tbdName}>{ev.name}</p>
                              <p className={styles.tbdMeta}>{ev.platforms?.[0]} · {ev.price}</p>
                            </div>
                            <span className={styles.tbdArrow}>→</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              {events.length > 0 && (
                <p className={styles.calHint}>Tap any event · Links open BookMyShow or District</p>
              )}
            </div>
          )}
        </main>

        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        <DayEventsModal
          events={dayEvents}
          day={dayEvents?.[0] ? dayEvents[0].day : null}
          month={month}
          year={year}
          onClose={() => setDayEvents(null)}
          onEventClick={setSelectedEvent}
        />
      </div>
    </>
  )
}
