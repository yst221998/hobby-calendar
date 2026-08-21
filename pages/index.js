import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Head from 'next/head'
import HobbyPicker from '../components/HobbyPicker'
import Calendar from '../components/Calendar'
import EventModal from '../components/EventModal'
import DayEventsModal from '../components/DayEventsModal'
import AuthPanel from '../components/AuthPanel'
import SavedEventsPanel from '../components/SavedEventsPanel'
import { getSupabaseBrowserClient, isBrowserSupabaseConfigured } from '../lib/supabaseClient'
import { userApiFetch, getEventUrl } from '../lib/userApi'
import styles from './index.module.css'

const STEPS = { INPUT: 'input', LOADING: 'loading', CALENDAR: 'calendar' }

const LOADING_MSGS = [
  'Searching BookMyShow & District…',
  'Matching your interests in Mumbai…',
  'Pulling booking links…',
  'Building your calendar…',
]

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

  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [savedEvents, setSavedEvents] = useState([])
  const [savedUrlSet, setSavedUrlSet] = useState(new Set())
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showSavedPanel, setShowSavedPanel] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [pendingSaveEvent, setPendingSaveEvent] = useState(null)
  const authConfigured = isBrowserSupabaseConfigured()
  const sessionHandledRef = useRef(false)
  const hobbiesRef = useRef(hobbies)
  const locationRef = useRef(location)
  const monthRef = useRef(month)
  const yearRef = useRef(year)
  const pendingSaveRef = useRef(pendingSaveEvent)

  useEffect(() => { hobbiesRef.current = hobbies }, [hobbies])
  useEffect(() => { locationRef.current = location }, [location])
  useEffect(() => { monthRef.current = month }, [month])
  useEffect(() => { yearRef.current = year }, [year])
  useEffect(() => { pendingSaveRef.current = pendingSaveEvent }, [pendingSaveEvent])

  const scheduledEvents = useMemo(() => events.filter(e => e.day !== null), [events])
  const unscheduledEvents = useMemo(() => events.filter(e => e.day === null), [events])
  const uniqueEventCount = useMemo(() => {
    const links = new Set()
    events.forEach(e => {
      const link = getEventUrl(e)
      if (link) links.add(link)
    })
    return links.size
  }, [events])

  const buildCacheKey = useCallback((m, y, currentHobbies, currentLocation) => {
    const sortedHobbies = [...currentHobbies].sort().join('|')
    return `${m}-${y}-${currentLocation || 'Mumbai'}-${sortedHobbies}`
  }, [])

  const fetchEvents = useCallback(async (m, y, currentHobbies, currentLocation, cache) => {
    const cacheKey = buildCacheKey(m, y, currentHobbies, currentLocation)
    if (cache[cacheKey]) return { events: cache[cacheKey], fromCache: true }

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hobbies: currentHobbies, city: currentLocation || 'Mumbai', month: m, year: y }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return { events: data.events || [], fromCache: false }
  }, [buildCacheKey])

  const savePreferences = useCallback(async (token, hobbyList, city, m, y) => {
    if (!token || hobbyList.length === 0) return
    try {
      await userApiFetch('/api/user/preferences', token, {
        method: 'POST',
        body: JSON.stringify({
          hobbies: hobbyList,
          city: city || 'Mumbai',
          month: m,
          year: y,
        }),
      })
    } catch (e) {
      console.error('Could not save preferences:', e.message)
    }
  }, [])

  const loadSavedEvents = useCallback(async (token) => {
    if (!token) return false
    try {
      const data = await userApiFetch('/api/user/saved-events', token)
      setSavedEvents(data.events || [])
      setSavedUrlSet(new Set(data.savedUrls || []))
      return true
    } catch (e) {
      console.error('Could not load saved events:', e.message)
      setError(e.message || 'Could not load saved events.')
      // Do not wipe existing list on GET failure
      return false
    }
  }, [])

  const runCalendarLoad = useCallback(async (hobbyList, city, m, y, existingCache = {}) => {
    if (hobbyList.length === 0) return

    setStep(STEPS.LOADING)
    let msgIndex = 0
    setLoadingMsg(LOADING_MSGS[0])
    const interval = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, LOADING_MSGS.length - 1)
      setLoadingMsg(LOADING_MSGS[msgIndex])
    }, 1500)

    try {
      const cacheKey = buildCacheKey(m, y, hobbyList, city)
      const result = await fetchEvents(m, y, hobbyList, city, existingCache)
      clearInterval(interval)
      const newCache = { ...existingCache, [cacheKey]: result.events }
      setEventCache(newCache)
      setEvents(result.events)
      setEventSources(['BookMyShow', 'District'])
      setStep(STEPS.CALENDAR)
    } catch (e) {
      clearInterval(interval)
      setError(e.message || 'Something went wrong loading your calendar.')
      setStep(STEPS.INPUT)
    }
  }, [buildCacheKey, fetchEvents])

  const applySignedInSession = useCallback(async (session, options = {}) => {
    if (!session?.access_token) return

    const { isGuestMerge = false } = options
    const token = session.access_token
    const currentHobbies = hobbiesRef.current
    const currentLocation = locationRef.current
    const currentMonth = monthRef.current
    const currentYear = yearRef.current

    // Always load saved events from the account
    await loadSavedEvents(token)

    // Guest → sign-in with hobbies already picked: save those onto the account
    if (isGuestMerge && currentHobbies.length > 0) {
      await savePreferences(token, currentHobbies, currentLocation || 'Mumbai', currentMonth, currentYear)
    }

    // Always restore preferences from the account (source of truth)
    try {
      const prefs = await userApiFetch('/api/user/preferences', token)
      if (prefs.hobbies?.length) {
        setHobbies(prefs.hobbies)
        setLocation(prefs.city === 'Mumbai' ? '' : prefs.city || '')

        const m = typeof prefs.defaultMonth === 'number' ? prefs.defaultMonth : currentMonth
        const y = typeof prefs.defaultYear === 'number' ? prefs.defaultYear : currentYear
        setMonth(m)
        setYear(y)

        // Always rebuild calendar from saved hobbies on restore / guest merge
        await runCalendarLoad(prefs.hobbies, prefs.city || 'Mumbai', m, y)
      }
    } catch (e) {
      console.error('Could not load preferences:', e.message)
      setError(e.message || 'Could not load your saved hobbies.')
    }

    const pending = pendingSaveRef.current
    if (pending) {
      const url = getEventUrl(pending)
      if (url) {
        try {
          await userApiFetch('/api/user/saved-events', token, {
            method: 'POST',
            body: JSON.stringify({
              eventUrl: url,
              month: currentMonth,
              year: currentYear,
              status: 'interested',
              eventName: pending.name || null,
              platform: pending.platforms?.[0] || null,
            }),
          })
          await loadSavedEvents(token)
        } catch (e) {
          console.error('Could not save event after sign-in:', e.message)
          setError(e.message || 'Could not save event after sign-in.')
        }
      }
      setPendingSaveEvent(null)
    }
  }, [loadSavedEvents, savePreferences, runCalendarLoad])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    let active = true
    let bootstrapped = false

    const cleanAuthParamsFromUrl = () => {
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      const hash = url.hash || ''
      const hasAuthHash = hash.includes('access_token') || hash.includes('type=magiclink') || hash.includes('type=recovery')
      const hasAuthQuery = url.searchParams.has('code') || url.searchParams.has('token_hash')
      if (hasAuthHash || hasAuthQuery) {
        window.history.replaceState({}, document.title, `${url.origin}${url.pathname}`)
      }
    }

    const bootstrapSession = async (session, isGuestMerge = false) => {
      if (!active || !session?.access_token) return
      setUser(session.user)
      setAccessToken(session.access_token)
      setShowAuthModal(false)
      cleanAuthParamsFromUrl()
      if (!bootstrapped) {
        bootstrapped = true
        sessionHandledRef.current = true
        await applySignedInSession(session, { isGuestMerge })
      } else {
        await loadSavedEvents(session.access_token)
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Refresh / returning visit — restore account, not guest merge
      if (session) await bootstrapSession(session, false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return

      if (session?.access_token) {
        setUser(session.user)
        setAccessToken(session.access_token)
        setShowAuthModal(false)

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          cleanAuthParamsFromUrl()
          const hadGuestHobbies = hobbiesRef.current.length > 0
          if (!sessionHandledRef.current) {
            sessionHandledRef.current = true
            bootstrapped = true
            // SIGNED_IN after magic link with hobbies in memory = guest merge
            const isGuestMerge = event === 'SIGNED_IN' && hadGuestHobbies
            await applySignedInSession(session, { isGuestMerge })
          } else if (event === 'SIGNED_IN') {
            if (hadGuestHobbies) {
              await applySignedInSession(session, { isGuestMerge: true })
            } else {
              await loadSavedEvents(session.access_token)
            }
          }
        } else if (event === 'TOKEN_REFRESHED') {
          await loadSavedEvents(session.access_token)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setAccessToken(null)
        setSavedEvents([])
        setSavedUrlSet(new Set())
        sessionHandledRef.current = false
        bootstrapped = false
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [applySignedInSession, loadSavedEvents])

  const handleSendMagicLink = async (email) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) throw new Error('Sign-in is not configured yet.')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
    if (error) throw error
  }

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setAccessToken(null)
    setSavedEvents([])
    setSavedUrlSet(new Set())
    setShowAuthModal(false)
  }

  const isEventSaved = useCallback((event) => {
    const url = getEventUrl(event)
    if (!url) return false
    return savedUrlSet.has(`${url}|${month}|${year}`)
  }, [savedUrlSet, month, year])

  const handleToggleSave = async () => {
    if (!selectedEvent) return

    if (!accessToken) {
      setPendingSaveEvent(selectedEvent)
      setAuthMessage('Sign in to save events you are interested in.')
      setShowAuthModal(true)
      return
    }

    const eventUrl = getEventUrl(selectedEvent)
    if (!eventUrl) return

    const saveKey = `${eventUrl}|${month}|${year}`
    const currentlySaved = savedUrlSet.has(saveKey)
    const prevEvents = savedEvents
    const prevUrls = new Set(savedUrlSet)

    setSaveLoading(true)

    // Optimistic UI update
    if (currentlySaved) {
      setSavedUrlSet(prev => {
        const next = new Set(prev)
        next.delete(saveKey)
        return next
      })
      setSavedEvents(prev => prev.filter(ev => getEventUrl(ev) !== eventUrl))
    } else {
      setSavedUrlSet(prev => new Set(prev).add(saveKey))
      setSavedEvents(prev => {
        if (prev.some(ev => getEventUrl(ev) === eventUrl)) return prev
        return [selectedEvent, ...prev]
      })
    }

    try {
      if (currentlySaved) {
        await userApiFetch('/api/user/saved-events', accessToken, {
          method: 'DELETE',
          body: JSON.stringify({ eventUrl, month, year }),
        })
      } else {
        await userApiFetch('/api/user/saved-events', accessToken, {
          method: 'POST',
          body: JSON.stringify({
            eventUrl,
            month,
            year,
            status: 'interested',
            eventName: selectedEvent.name || null,
            platform: selectedEvent.platforms?.[0] || null,
          }),
        })
      }
      const ok = await loadSavedEvents(accessToken)
      if (!ok) {
        // GET failed after successful write — keep optimistic state
      }
    } catch (e) {
      // Revert optimistic update on POST/DELETE failure
      setSavedEvents(prevEvents)
      setSavedUrlSet(prevUrls)
      setError(e.message || 'Could not update saved event. Try signing in again.')
    } finally {
      setSaveLoading(false)
    }
  }

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
      const cacheKey = buildCacheKey(month, year, hobbies, location)
      const result = await fetchEvents(month, year, hobbies, location, {})
      clearInterval(interval)
      const newCache = { [cacheKey]: result.events }
      setEventCache(newCache)
      setEvents(result.events)
      setEventSources(['BookMyShow', 'District'])
      setStep(STEPS.CALENDAR)

      if (accessToken) {
        await savePreferences(accessToken, hobbies, location || 'Mumbai', month, year)
      }
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

    const cacheKey = buildCacheKey(m, y, hobbies, location)
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

      if (accessToken) {
        await savePreferences(accessToken, hobbies, location || 'Mumbai', m, y)
      }
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.logo}>
              <span className={styles.logoMark}>◆</span>
              <span className={styles.logoText}>HobbyMap</span>
            </div>

            <div className={styles.headerActions}>
              {step === STEPS.CALENDAR && (
                <button
                  type="button"
                  className={`${styles.resetBtn} ${styles.resetBtnDesktop}`}
                  onClick={() => { setStep(STEPS.INPUT); setEvents([]) }}
                >
                  ← Change hobbies
                </button>
              )}

              {authConfigured && user && (
                <button
                  type="button"
                  className={styles.savedBtn}
                  onClick={() => setShowSavedPanel(true)}
                >
                  Saved ({savedEvents.length})
                </button>
              )}

              {authConfigured && (
                user ? (
                  <div className={styles.accountChip}>
                    <span className={styles.accountEmail}>{user.email}</span>
                    <button type="button" className={styles.signOutBtn} onClick={handleSignOut}>
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.accountBtn}
                    onClick={() => { setAuthMessage(''); setShowAuthModal(true) }}
                  >
                    Sign in
                  </button>
                )
              )}
            </div>
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

              {authConfigured && !user && (
                <div className={styles.authCard}>
                  <p className={styles.authCardTitle}>Optional account</p>
                  <p className={styles.authCardSub}>Search without signing in. Create an account to save your calendar and mark events you&apos;re interested in.</p>
                  <AuthPanel onSendMagicLink={handleSendMagicLink} onSignOut={handleSignOut} />
                </div>
              )}

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
                    {scheduledEvents.length} showings · {uniqueEventCount} events · {hobbies.join(', ')} · {location || 'Mumbai'}
                  </p>
                  {eventSources.length > 0 && (
                    <p className={styles.sourcesList}>From: {eventSources.join(' · ')}</p>
                  )}
                  <button
                    type="button"
                    className={`${styles.resetBtn} ${styles.resetBtnMobile}`}
                    onClick={() => { setStep(STEPS.INPUT); setEvents([]) }}
                  >
                    ← Change hobbies
                  </button>
                </div>
                <div className={styles.legend}>
                  {hobbies.slice(0, 4).map((h, i) => (
                    <span key={h} className={`${styles.legendDot} ${styles['dot' + i]}`}>{h}</span>
                  ))}
                </div>
              </div>

              {authConfigured && user && (
                <section className={styles.savedSection}>
                  <div className={styles.savedSectionHeader}>
                    <h3 className={styles.savedSectionTitle}>Saved events</h3>
                    {savedEvents.length > 0 && (
                      <button type="button" className={styles.savedViewAll} onClick={() => setShowSavedPanel(true)}>
                        View all
                      </button>
                    )}
                  </div>
                  {savedEvents.length === 0 ? (
                    <p className={styles.savedEmpty}>Tap ★ Interested on any event to bookmark it here.</p>
                  ) : (
                    <div className={styles.savedPreview}>
                      {savedEvents.slice(0, 3).map((ev, i) => (
                        <button
                          key={`${getEventUrl(ev)}-${i}`}
                          type="button"
                          className={styles.savedPreviewRow}
                          onClick={() => setSelectedEvent(ev)}
                        >
                          <span>{ev.platformIcon || '📅'}</span>
                          <span className={styles.savedPreviewName}>{ev.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

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
                  <p>We only show specific bookable events on BookMyShow and District — venue listings, category pages, and other cities are filtered out. Try a different month or adjust your interests.</p>
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
                      <p className={styles.tbdSub}>
                        {unscheduledEvents.length} listing{unscheduledEvents.length !== 1 ? 's' : ''} without a confirmed date this month — closed or cancelled shows are filtered out
                      </p>
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
                <p className={styles.calHint}>Each event opens its BookMyShow or District booking page</p>
              )}
            </div>
          )}
        </main>

        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          isSaved={selectedEvent ? isEventSaved(selectedEvent) : false}
          onToggleSave={handleToggleSave}
          saveLoading={saveLoading}
          authConfigured={authConfigured}
        />

        {showAuthModal && authConfigured && (
          <div className={styles.authOverlay} onClick={(e) => e.target === e.currentTarget && setShowAuthModal(false)}>
            <div className={styles.authModal}>
              <button type="button" className={styles.authClose} onClick={() => setShowAuthModal(false)}>×</button>
              <h2 className={styles.authModalTitle}>Sign in</h2>
              <AuthPanel
                user={user}
                onSendMagicLink={handleSendMagicLink}
                onSignOut={handleSignOut}
                message={authMessage}
              />
            </div>
          </div>
        )}

        {showSavedPanel && (
          <SavedEventsPanel
            events={savedEvents}
            onEventClick={(ev) => { setSelectedEvent(ev); setShowSavedPanel(false) }}
            onClose={() => setShowSavedPanel(false)}
          />
        )}

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
