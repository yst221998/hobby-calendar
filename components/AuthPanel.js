import { useState } from 'react'
import styles from './AuthPanel.module.css'

export default function AuthPanel({
  user,
  onSendMagicLink,
  onSignOut,
  compact = false,
  message = '',
}) {
  const [email, setEmail] = useState(user?.email || '')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setStatus('')
    try {
      await onSendMagicLink(email.trim())
      setStatus('Check your email for the magic link.')
    } catch (err) {
      setStatus(err.message || 'Could not send magic link.')
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    return (
      <div className={`${styles.panel} ${compact ? styles.compact : ''}`}>
        <p className={styles.signedIn}>Signed in as {user.email}</p>
        <button type="button" className={styles.signOutBtn} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ''}`}>
      {message && <p className={styles.message}>{message}</p>}
      <form className={styles.form} onSubmit={handleSend}>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.input}
        />
        <button type="submit" className={styles.submitBtn} disabled={loading || !email.trim()}>
          {loading ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {status && <p className={styles.status}>{status}</p>}
      <p className={styles.hint}>Optional — save your calendar and interested events.</p>
    </div>
  )
}
