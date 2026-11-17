import { useEffect, useMemo, useState } from 'react'
import './App.css'

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span>T</span></span>
}

function EyeIcon({ hidden }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 5.1A10.7 10.7 0 0112 5c5.2 0 8.5 4.2 9.5 7-.4 1.1-1.1 2.3-2 3.4M6.2 6.2C4.3 7.7 3.2 9.7 2.5 12c1 2.8 4.3 7 9.5 7 1 0 1.9-.2 2.8-.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.8" /></svg>
  )
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.5a4.7 4.7 0 01-2 3.1v2.5h3.2c1.9-1.8 3.1-4.3 3.1-7.4z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 .9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.9v2.6A10 10 0 0012 22z" /><path fill="#FBBC05" d="M6.2 13.7a6 6 0 010-3.6V7.5H2.9a10 10 0 000 9l3.3-2.8z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 3 14.7 2 12 2a10 10 0 00-9.1 5.5l3.3 2.6C7 7.8 9.3 6 12 6z" /></svg>
}

function readSavedSession() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const value = storage.getItem('typerush.auth')
      if (!value) continue
      const session = JSON.parse(value)
      if (session.accessToken && new Date(session.expiresAtUtc) > new Date()) return { session, storage }
    } catch {
      // Ignore an invalid or outdated stored session.
    }
  }
  return null
}

function getDisplayName(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.unique_name || payload.email?.split('@')[0] || 'Racer'
  } catch {
    return 'Racer'
  }
}

function App() {
  const [savedSession] = useState(readSavedSession)
  const [isDashboardOpen, setIsDashboardOpen] = useState(Boolean(savedSession))
  const [isPracticeOpen, setIsPracticeOpen] = useState(false)
  const [displayName, setDisplayName] = useState(() => savedSession ? getDisplayName(savedSession.session.accessToken) : '')
  const [mode, setMode] = useState('login')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [formValues, setFormValues] = useState({ displayName: '', email: '', password: '' })
  const [authState, setAuthState] = useState({ status: 'idle', message: '' })
  const isLogin = mode === 'login'
  const switchMode = (nextMode) => {
    setMode(nextMode)
    setShowPassword(false)
    setAuthState({ status: 'idle', message: '' })
  }

  const updateField = (event) => {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setAuthState({ status: 'loading', message: '' })

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const requestBody = isLogin
        ? { email: formValues.email.trim(), password: formValues.password }
        : { email: formValues.email.trim(), username: formValues.displayName.trim(), password: formValues.password }
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'https://localhost:7244'}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain' },
        body: JSON.stringify(requestBody),
      })
      const rawBody = await response.text()
      let result = rawBody
      try { result = rawBody ? JSON.parse(rawBody) : {} } catch { /* Some API responses are plain text. */ }

      if (!response.ok) {
        const message = typeof result === 'object'
          ? result.message || result.title || result.error || (isLogin ? 'Unable to log in. Please check your email and password.' : 'Unable to create your account. Please try again.')
          : result || (isLogin ? 'Unable to log in. Please check your email and password.' : 'Unable to create your account. Please try again.')
        throw new Error(message)
      }

      if (isLogin) {
        const accessToken = result?.accessToken ?? result?.AccessToken
        const tokenType = result?.tokenType ?? result?.TokenType
        const expiresAtUtc = result?.expiresAtUtc ?? result?.ExpiresAtUtc
        const refreshToken = result?.refreshToken ?? result?.RefreshToken

        if (!accessToken || !tokenType || !expiresAtUtc || !refreshToken) {
          throw new Error('The login response was missing authentication details. Please try again.')
        }

        const storage = rememberMe ? localStorage : sessionStorage
        storage.setItem('typerush.auth', JSON.stringify({ accessToken, tokenType, expiresAtUtc, refreshToken }))
        setFormValues((current) => ({ ...current, password: '' }))
        setAuthState({ status: 'success', message: 'Logged in successfully.' })
        setDisplayName(getDisplayName(accessToken))
        setIsDashboardOpen(true)
        setIsPracticeOpen(false)
      } else {
        setAuthState({ status: 'success', message: 'Account created successfully. You can now log in.' })
        setFormValues({ displayName: '', email: '', password: '' })
      }
    } catch (error) {
      setAuthState({ status: 'error', message: error instanceof Error ? error.message : (isLogin ? 'Unable to log in. Please try again.' : 'Unable to create your account. Please try again.') })
    }
  }

  const logout = () => {
    localStorage.removeItem('typerush.auth')
    sessionStorage.removeItem('typerush.auth')
    setIsPracticeOpen(false)
    setIsDashboardOpen(false)
    setAuthState({ status: 'idle', message: '' })
  }

  if (isDashboardOpen) {
    return isPracticeOpen
      ? <PracticePage displayName={displayName} onBack={() => setIsPracticeOpen(false)} />
      : <Dashboard displayName={displayName} onLogout={logout} onPractice={() => setIsPracticeOpen(true)} />
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label="TypeRush authentication">
        <a className="brand" href="#top" aria-label="TypeRush home"><BrandMark /><span>TypeRush</span></a>
        <div className="auth-content">
          <div className="eyebrow"><span className="status-dot" /> LIVE TYPING COMPETITIONS</div>
          <h1>{isLogin ? 'Welcome back.' : 'Ready to race?'}</h1>
          <p className="intro">{isLogin ? 'Sign in to jump back into the action.' : 'Create your account and find out how fast you really are.'}</p>
          <div className="auth-tabs" role="tablist" aria-label="Authentication choice">
            <button className={isLogin ? 'active' : ''} type="button" role="tab" aria-selected={isLogin} onClick={() => switchMode('login')}>Log in</button>
            <button className={!isLogin ? 'active' : ''} type="button" role="tab" aria-selected={!isLogin} onClick={() => switchMode('register')}>Create account</button>
          </div>
          <form onSubmit={handleSubmit}>
            {!isLogin && <label>Display name<input type="text" name="displayName" value={formValues.displayName} onChange={updateField} placeholder="How should we call you?" autoComplete="nickname" required /></label>}
            <label>Email address<input type="email" name="email" value={formValues.email} onChange={updateField} placeholder="you@example.com" autoComplete="email" required /></label>
            <label>Password<span className="password-field"><input type={showPassword ? 'text' : 'password'} name="password" value={formValues.password} onChange={updateField} placeholder={isLogin ? 'Enter your password' : 'Create a strong password'} autoComplete={isLogin ? 'current-password' : 'new-password'} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}><EyeIcon hidden={showPassword} /></button></span></label>
            {isLogin ? <div className="form-options"><label className="check-label"><input type="checkbox" name="remember" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label><a href="#forgot-password">Forgot password?</a></div> : <p className="terms">By continuing, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</p>}
            {authState.status !== 'idle' && <p className={`form-message ${authState.status}`} role={authState.status === 'error' ? 'alert' : 'status'}>{authState.message}</p>}
            <button className="primary-button" type="submit" disabled={authState.status === 'loading'}>{isLogin ? authState.status === 'loading' ? 'Logging in…' : 'Log in to TypeRush' : authState.status === 'loading' ? 'Creating account…' : 'Create my account'} <span aria-hidden="true">→</span></button>
          </form>
          <div className="divider"><span>or continue with</span></div>
          <button className="google-button" type="button"><GoogleIcon /> Google</button>
          <p className="mobile-switch">{isLogin ? 'New to TypeRush?' : 'Already have an account?'} <button type="button" onClick={() => switchMode(isLogin ? 'register' : 'login')}>{isLogin ? 'Create an account' : 'Log in'}</button></p>
        </div>
        <p className="copyright">© 2026 TypeRush. Built for people who like to move fast.</p>
      </section>
      <aside className="showcase" aria-label="TypeRush competition preview">
        <nav><a className="brand brand-light" href="#top"><BrandMark /><span>TypeRush</span></a><span className="nav-note">The competitive typing arena</span></nav>
        <div className="showcase-body">
          <p className="race-label"><span className="pulse" /> RACE IN PROGRESS</p><h2>Every word<br />counts.</h2><p className="showcase-copy">Challenge your limits, compete in real time, and climb the leaderboard.</p>
          <div className="race-card"><div className="race-card-header"><span>Final sprint</span><span>00:18</span></div><Racer initial="A" name="Aria" speed="112" progress="91%" color="amber" /><Racer initial="J" name="Jordan" speed="98" progress="76%" color="purple" /><Racer initial="M" name="Maya" speed="86" progress="63%" color="blue" /></div>
        </div>
        <div className="decor-dot dot-one" /><div className="decor-dot dot-two" /><div className="decor-ring" />
      </aside>
    </main>
  )
}

function Dashboard({ displayName, onLogout, onPractice }) {
  const [roomCode, setRoomCode] = useState('')
  const [notice, setNotice] = useState('')

  const createRoom = () => setNotice('Room creation is ready to connect when the multiplayer API is added.')
  const joinRoom = (event) => {
    event.preventDefault()
    setNotice(roomCode.trim() ? `Joining room ${roomCode.trim().toUpperCase()}…` : 'Enter a room code to join a race.')
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="brand" href="#top" aria-label="TypeRush dashboard"><BrandMark /><span>TypeRush</span></a>
        <div className="header-actions"><span className="online-indicator"><i /> Online</span><button className="logout-button" type="button" onClick={onLogout}>Log out</button></div>
      </header>

      <section className="dashboard-shell" aria-label="Your TypeRush dashboard">
        <div className="dashboard-intro">
          <p className="eyebrow"><span className="status-dot" /> YOUR TYPING ARENA</p>
          <h1>Welcome back, {displayName}.</h1>
          <p>Ready to put your fingers to work?</p>
        </div>

        <section className="stats-grid" aria-label="Your typing statistics">
          <StatCard label="Races" value="0" icon="⌁" />
          <StatCard label="Wins" value="0" icon="★" />
          <StatCard label="Average WPM" value="—" icon="↗" />
          <StatCard label="Accuracy" value="—" icon="◎" />
        </section>

        <div className="dashboard-actions-grid">
          <section className="dashboard-card practice-card">
            <div className="card-icon practice-icon" aria-hidden="true">⌨</div>
            <div className="card-copy"><p className="card-kicker">SOLO MODE</p><h2>Practice</h2><p>Improve your speed on your own, one race at a time.</p></div>
            <button className="action-button primary-action" type="button" onClick={onPractice}>Start practice <span aria-hidden="true">→</span></button>
          </section>

          <section className="dashboard-card multiplayer-card">
            <div className="multiplayer-heading"><div className="card-icon multiplayer-icon" aria-hidden="true">♜</div><div className="card-copy"><p className="card-kicker">RACE TOGETHER</p><h2>Multiplayer</h2><p>Challenge friends or invite the whole group.</p></div></div>
            <button className="action-button secondary-action" type="button" onClick={createRoom}>Create room <span aria-hidden="true">+</span></button>
            <div className="room-divider"><span>OR JOIN A RACE</span></div>
            <form className="join-room" onSubmit={joinRoom}>
              <label htmlFor="room-code">Have a room code?</label>
              <input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="e.g. FAST-42" maxLength="16" />
              <button className="action-button join-action" type="submit">Join room <span aria-hidden="true">→</span></button>
            </form>
          </section>
        </div>

        {notice && <p className="dashboard-notice" role="status">{notice}</p>}
      </section>
      <footer className="dashboard-footer">© 2026 TypeRush <span>•</span> Built for people who like to move fast.</footer>
    </main>
  )
}

const practiceCopy = {
  easy: [
    'Small steps add up. Keep your eyes on the words, relax your hands, and let each key lead you to the next one.',
    'Practice makes a quiet kind of progress. Stay calm, type with care, and watch your speed grow one word at a time.',
  ],
  medium: [
    'Good typing is not only about moving quickly; it is about finding a steady rhythm that lets accuracy and speed work together naturally.',
    'Focus on the sentence in front of you, not the clock. A clear mind and even pace will help your fingers find their flow.',
  ],
  strong: [
    'Precision under pressure comes from repetition: observe the punctuation, trust your muscle memory, and maintain an intentional cadence through every phrase.',
    'A resilient typist balances velocity with control, recovering gracefully from mistakes while preserving the concentration required for consistently accurate work.',
  ],
}

function PracticePage({ displayName, onBack }) {
  const [duration, setDuration] = useState(60)
  const [level, setLevel] = useState('medium')
  const [round, setRound] = useState(0)
  const [input, setInput] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const [hasStarted, setHasStarted] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const passage = useMemo(() => practiceCopy[level][round % practiceCopy[level].length], [level, round])
  const typedLength = input.length
  const correctCharacters = input.split('').reduce((total, character, index) => total + (character === passage[index] ? 1 : 0), 0)
  const accuracy = typedLength ? Math.round((correctCharacters / typedLength) * 100) : 100
  const elapsedSeconds = hasStarted ? Math.max(1, duration - timeLeft) : 0
  const wpm = elapsedSeconds ? Math.round((correctCharacters / 5) / (elapsedSeconds / 60)) : 0

  const resetRound = (nextDuration = duration, nextLevel = level, nextRound = round) => {
    setDuration(nextDuration)
    setLevel(nextLevel)
    setRound(nextRound)
    setInput('')
    setTimeLeft(nextDuration)
    setHasStarted(false)
    setIsComplete(false)
  }

  useEffect(() => {
    if (!hasStarted || isComplete) return undefined
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          setIsComplete(true)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hasStarted, isComplete])

  const handleInput = (event) => {
    if (isComplete) return
    const nextValue = event.target.value.slice(0, passage.length)
    if (!hasStarted && nextValue) setHasStarted(true)
    setInput(nextValue)
    if (nextValue === passage) setIsComplete(true)
  }

  const chooseDuration = (nextDuration) => resetRound(nextDuration)
  const chooseLevel = (nextLevel) => resetRound(duration, nextLevel)
  const nextPassage = () => resetRound(duration, level, round + 1)
  const formatTime = `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`

  return (
    <main className="practice-page">
      <header className="practice-header">
        <button className="back-button" type="button" onClick={onBack}><span aria-hidden="true">←</span> Dashboard</button>
        <a className="brand" href="#top" aria-label="TypeRush practice"><BrandMark /><span>TypeRush</span></a>
        <span className="practice-user">{displayName || 'Racer'}</span>
      </header>

      <section className="practice-shell" aria-label="Typing practice">
        <div className="practice-title-row">
          <div><p className="eyebrow"><span className="status-dot" /> SOLO TRAINING</p><h1>Practice your pace.</h1><p>Choose your challenge, then type the passage as accurately as you can.</p></div>
          <div className={`timer ${hasStarted ? 'is-running' : ''}`} aria-label={`${timeLeft} seconds remaining`}><span>TIME LEFT</span><strong>{formatTime}</strong></div>
        </div>

        <section className="practice-settings" aria-label="Practice settings">
          <div className="setting-group"><span className="setting-label">DURATION</span><div className="segment-control" role="group" aria-label="Select practice duration">{[30, 60, 120].map((option) => <button key={option} className={duration === option ? 'selected' : ''} type="button" onClick={() => chooseDuration(option)}>{option}s</button>)}</div></div>
          <div className="setting-group"><span className="setting-label">LANGUAGE LEVEL</span><div className="segment-control level-control" role="group" aria-label="Select language level">{['easy', 'medium', 'strong'].map((option) => <button key={option} className={level === option ? 'selected' : ''} type="button" onClick={() => chooseLevel(option)}>{option}</button>)}</div></div>
          <button className="new-passage-button" type="button" onClick={nextPassage}><span aria-hidden="true">↻</span> New passage</button>
        </section>

        <section className="typing-card" aria-label="Typing passage">
          <div className="typing-card-head"><span>{isComplete ? (input === passage ? 'PASSAGE COMPLETE' : 'TIME IS UP') : hasStarted ? 'KEEP GOING' : 'READY WHEN YOU ARE'}</span><span>{typedLength} / {passage.length} characters</span></div>
          <p className="typing-passage" aria-hidden="true">{passage.split('').map((character, index) => <span key={`${character}-${index}`} className={index < typedLength ? (input[index] === character ? 'correct' : 'incorrect') : index === typedLength ? 'current-character' : ''}>{character}</span>)}</p>
          <label className="sr-only" htmlFor="practice-input">Type the passage shown above</label>
          <textarea id="practice-input" className="practice-input" value={input} onChange={handleInput} disabled={isComplete} autoFocus placeholder="Start typing here…" spellCheck="false" autoCapitalize="off" autoComplete="off" />
          <div className="typing-hint"><span className="keyboard-key">TAB</span> Keep your eyes on the text. Accuracy first, speed follows.</div>
        </section>

        <section className="live-stats" aria-label="Live typing statistics">
          <article><span className="stat-icon" aria-hidden="true">↗</span><p>Speed</p><strong>{wpm} <small>WPM</small></strong></article>
          <article><span className="stat-icon" aria-hidden="true">◎</span><p>Accuracy</p><strong>{accuracy}<small>%</small></strong></article>
          <article><span className="stat-icon" aria-hidden="true">⌁</span><p>Characters</p><strong>{correctCharacters}<small> / {typedLength}</small></strong></article>
        </section>

        {isComplete && <div className="completion-banner" role="status"><div><span className="status-dot" /> {input === passage ? 'Nice run.' : 'Round finished.'}<small>{wpm} WPM · {accuracy}% accuracy</small></div><button type="button" onClick={nextPassage}>Practice again <span aria-hidden="true">→</span></button></div>}
      </section>
    </main>
  )
}

function StatCard({ label, value, icon }) {
  return <article className="stat-card"><span className="stat-icon" aria-hidden="true">{icon}</span><p>{label}</p><strong>{value}</strong></article>
}

function Racer({ initial, name, speed, progress, color }) {
  return <div className="racer"><span className={`avatar ${color}`}>{initial}</span><span className="racer-name">{name}</span><span className="race-progress"><i style={{ width: progress }} /></span><strong>{speed} <small>wpm</small></strong></div>
}

export default App
