import { useState } from 'react'
import Head from 'next/head'
import HobbyPicker from '../components/HobbyPicker'
import Calendar from '../components/Calendar'
import EventModal from '../components/EventModal'
import styles from './index.module.css'

const STEPS = { INPUT: 'input', LOADING: 'loading', CALENDAR: 'calendar' }

export default function Home() {
  const [step, setStep] = useState(STEPS.INPUT)
  const [hobbies, setHobbies] = useState([])
  const [location, setLocation] = useState('')
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [error, setError] = useState('')
  const [loadingMsg, setLoadingMsg] = useState('')

  const LOADING_MSGS = [
    'Scanning events across Mumbai…',
    'Matching your interests on BookMyShow & Insider…',
    'Asking our AI to fill in the gaps…',
    'Polishing your calendar…',
  ]

  const handleFind = async () => {
    if (hobbies.length === 0) { setError('Please pick at least one hobby.'); return }
    setError('')
    setStep(STEPS.LOADING)

    let msgIndex = 0
    setLoadingMsg(LOADING_MSGS[0])
    const interval = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, LOADING_MSGS.length - 1)
      setLoadingMsg(LOADING_MSGS[msgIndex])
    }, 1500)

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hobbies, city: location || 'Mumbai', month, year }),
      })
      const data = await res.json()
      clearInterval(interval)
      if (data.error) { setError(data.error); setStep(STEPS.INPUT); return }
      setEvents(data.events || [])
      setStep(STEPS.CALENDAR)
    } catch (e) {
      clearInterval(interval)
      setError('Something went wrong. Check your API keys in .env.local')
      setStep(STEPS.INPUT)
    }
  }

  const handleMonthChange = (dir) => {
    let m = month + dir
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
  }

  return (
    <>
      <Head>
        <title>Hobby Calendar — Mumbai Events</title>
        <meta name="description" content="Discover events and activities in Mumbai tailored to your hobbies" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.page}>
        {/* Header */}
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

          {/* STEP 1: Input */}
          {step === STEPS.INPUT && (
            <div className={styles.inputSection}>
              <div className={styles.hero}>
                <p className={styles.heroEyebrow}>Mumbai · Events · Just for you</p>
                <h1 className={styles.heroTitle}>What do you love doing?</h1>
                <p className={styles.heroSub}>Pick your interests and we'll fill your calendar with events, workshops, and experiences — all bookable in one tap.</p>
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

              <p className={styles.hint}>Powered by Google Events + AI · Links open BookMyShow, Insider.in & District</p>
            </div>
          )}

          {/* STEP 2: Loading */}
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

          {/* STEP 3: Calendar */}
          {step === STEPS.CALENDAR && (
            <div className={styles.calendarSection}>
              <div className={styles.calendarHeader}>
                <div>
                  <h2 className={styles.calendarTitle}>Your events calendar</h2>
                  <p className={styles.calendarSub}>{events.length} events found · {hobbies.join(', ')} · {location || 'Mumbai'}</p>
                </div>
                <div className={styles.legend}>
                  {hobbies.slice(0, 4).map((h, i) => (
                    <span key={h} className={`${styles.legendDot} ${styles['dot' + i]}`}>{h}</span>
                  ))}
                </div>
              </div>

              <Calendar
                events={events}
                month={month}
                year={year}
                onMonthChange={handleMonthChange}
                onEventClick={setSelectedEvent}
              />

              <p className={styles.calHint}>Tap any event to see details and booking links</p>
            </div>
          )}
        </main>

        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      </div>
    </>
  )
}
