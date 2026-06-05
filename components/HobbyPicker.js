import { useState } from 'react'
import styles from './HobbyPicker.module.css'

const PRESET_HOBBIES = [
  { label: 'Music', emoji: '🎵' },
  { label: 'Art & Craft', emoji: '🎨' },
  { label: 'Photography', emoji: '📷' },
  { label: 'Fitness', emoji: '🏃' },
  { label: 'Comedy', emoji: '😂' },
  { label: 'Theatre', emoji: '🎭' },
  { label: 'Food & Dining', emoji: '🍽️' },
  { label: 'Dance', emoji: '💃' },
  { label: 'Hiking', emoji: '🥾' },
  { label: 'Wellness', emoji: '🧘' },
  { label: 'Tech & Gaming', emoji: '🎮' },
  { label: 'Books & Literature', emoji: '📚' },
  { label: 'Cinema', emoji: '🎬' },
  { label: 'Wine & Cocktails', emoji: '🍷' },
  { label: 'Yoga', emoji: '🕉️' },
  { label: 'Stand-up Comedy', emoji: '🎤' },
]

export default function HobbyPicker({ selected, onChange }) {
  const [custom, setCustom] = useState('')

  const toggle = (label) => {
    if (selected.includes(label)) {
      onChange(selected.filter(h => h !== label))
    } else {
      onChange([...selected, label])
    }
  }

  const addCustom = () => {
    const v = custom.trim()
    if (!v || selected.includes(v)) return
    onChange([...selected, v])
    setCustom('')
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.grid}>
        {PRESET_HOBBIES.map(h => (
          <button
            key={h.label}
            className={`${styles.chip} ${selected.includes(h.label) ? styles.selected : ''}`}
            onClick={() => toggle(h.label)}
            type="button"
          >
            <span className={styles.emoji}>{h.emoji}</span>
            <span>{h.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.customRow}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="Add your own interest..."
        />
        <button className={styles.addBtn} onClick={addCustom} type="button">+ Add</button>
      </div>
      {selected.length > 0 && (
        <div className={styles.tags}>
          {selected.map(s => (
            <span key={s} className={styles.tag}>
              {s}
              <button onClick={() => toggle(s)} className={styles.removeBtn} type="button">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
