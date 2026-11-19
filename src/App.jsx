import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { LiveLobby } from './components/LiveLobby'
import { apiRequest } from './api/client'
import { createRaceHubConnection } from './realtime/lobbySession'

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
  const [activeRace, setActiveRace] = useState(null)
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
      const result = await apiRequest(endpoint, { method: 'POST', body: requestBody })

      if (isLogin) {
        const accessToken = result?.accessToken ?? result?.AccessToken
        const tokenType = result?.tokenType ?? result?.TokenType
        const expiresAtUtc = result?.expiresAtUtc ?? result?.ExpiresAtUtc
        const refreshToken = result?.refreshToken ?? result?.RefreshToken

        if (!accessToken || !tokenType || !expiresAtUtc || !refreshToken) {
          throw new Error('The login response was missing authentication details. Please try again.')
        }

        localStorage.removeItem('typerush.auth')
        sessionStorage.removeItem('typerush.auth')
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
    setActiveRace(null)
    setIsDashboardOpen(false)
    setAuthState({ status: 'idle', message: '' })
  }

  useEffect(() => {
    const expire = () => {
      logout()
      setAuthState({ status: 'error', message: 'Your session has expired. Please log in again.' })
    }
    window.addEventListener('typerush:unauthorized', expire)
    return () => window.removeEventListener('typerush:unauthorized', expire)
  }, [])

  if (isDashboardOpen) {
    return activeRace
      ? <RaceArena race={activeRace} displayName={displayName} onBack={() => setActiveRace(null)} />
      : isPracticeOpen
      ? <PracticePage displayName={displayName} onBack={() => setIsPracticeOpen(false)} />
      : <Dashboard displayName={displayName} onLogout={logout} onPractice={() => setIsPracticeOpen(true)} onRaceCountdown={setActiveRace} />
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

function Dashboard({ displayName, onLogout, onPractice, onRaceCountdown }) {
  const [roomCode, setRoomCode] = useState('')
  const [notice, setNotice] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [dashboardError, setDashboardError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [room, setRoom] = useState(null)
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false)
  const actionInFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/dashboard', { authenticated: true, signal: controller.signal })
      .then(setDashboard)
      .catch(error => { if (!controller.signal.aborted) setDashboardError(error.message) })
    return () => controller.abort()
  }, [reload])

  const enterRoom = async (action) => {
    if (actionInFlight.current) return
    const code = roomCode.trim().toUpperCase()
    if (action === 'join' && !/^[A-Z0-9]{8}$/.test(code)) {
      setNotice('Enter an eight-character room code containing letters and numbers.')
      return
    }
    actionInFlight.current = true
    setBusy(action)
    setNotice('')
    try {
      const result = await apiRequest(action === 'create' ? '/api/rooms' : '/api/rooms/join', {
        method: 'POST', authenticated: true,
        ...(action === 'join' ? { body: { roomCode: code } } : {}),
      })
      setRoom(result)
    } catch (error) {
      setNotice(error.message)
    } finally {
      actionInFlight.current = false
      setBusy('')
    }
  }
  const createRoom = () => enterRoom('create')
  const joinRoom = (event) => { event.preventDefault(); enterRoom('join') }

  if (room) return <RoomPage room={room} onBack={() => setRoom(null)} onRaceCountdown={onRaceCountdown} />
  if (isJoinRoomOpen) return <JoinRoomPage roomCode={roomCode} busy={busy} notice={notice} onCodeChange={setRoomCode} onJoin={joinRoom} onBack={() => { setNotice(''); setIsJoinRoomOpen(false) }} />

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="brand" href="#top" aria-label="TypeRush dashboard"><BrandMark /><span>TypeRush</span></a>
        <div className="header-actions"><span className="online-indicator"><i /> Online</span><button className="logout-button" type="button" onClick={onLogout}>Log out</button></div>
      </header>

      <section className="dashboard-shell" aria-label="Your TypeRush dashboard">
        <div className="dashboard-intro">
          <p className="eyebrow"><span className="status-dot" /> YOUR TYPING ARENA</p>
          <h1>Welcome back, {dashboard?.displayName || displayName}.</h1>
          <p>Ready to put your fingers to work?</p>
        </div>

        {dashboardError ? <p role="alert">{dashboardError} <button onClick={() => { setDashboardError(''); setReload(value => value + 1) }}>Retry</button></p> : !dashboard && <p role="status">Loading your dashboard…</p>}
        <section className="stats-grid" aria-label="Your typing statistics">
          <StatCard label="Races" value={dashboard?.statistics.racesPlayed ?? "—"} icon="⌁" />
          <StatCard label="Wins" value={dashboard?.statistics.wins ?? "—"} icon="★" />
          <StatCard label="Average WPM" value={dashboard?.statistics.averageWpm ?? "—"} icon="↗" />
          <StatCard label="Accuracy" value={dashboard?.statistics.averageAccuracy == null ? "—" : `${dashboard.statistics.averageAccuracy}%`} icon="◎" />
        </section>

        <div className="dashboard-actions-grid">
          <section className="dashboard-card practice-card">
            <div className="card-icon practice-icon" aria-hidden="true">⌨</div>
            <div className="card-copy"><p className="card-kicker">SOLO MODE</p><h2>Practice</h2><p>Improve your speed on your own, one race at a time.</p></div>
            <button className="action-button primary-action" type="button" onClick={onPractice}>Start practice <span aria-hidden="true">→</span></button>
          </section>

          <section className="dashboard-card multiplayer-card">
            <div className="multiplayer-heading"><div className="card-icon multiplayer-icon" aria-hidden="true">♜</div><div className="card-copy"><p className="card-kicker">RACE TOGETHER</p><h2>Multiplayer</h2><p>Challenge friends or invite the whole group.</p></div></div>
            <button className="action-button secondary-action" type="button" onClick={createRoom} disabled={Boolean(busy)}>{busy === 'create' ? 'Creating…' : 'Create room'} <span aria-hidden="true">+</span></button>
            <div className="room-divider"><span>OR JOIN A RACE</span></div>
            <div className="dashboard-join-cta">
              <div><strong>Have an invite code?</strong><span>Enter it to join your friends.</span></div>
              <button className="action-button join-action" type="button" onClick={() => { setNotice(''); setIsJoinRoomOpen(true) }} disabled={Boolean(busy)}>Join room <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </div>

        {notice && <p className="dashboard-notice" role="alert">{notice}</p>}
      </section>
      <footer className="dashboard-footer">© 2026 TypeRush <span>•</span> Built for people who like to move fast.</footer>
    </main>
  )
}

function JoinRoomPage({ roomCode, busy, notice, onCodeChange, onJoin, onBack }) {
  const updateCode = (event) => onCodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))

  return (
    <main className="dashboard-page join-room-page">
      <header className="dashboard-header">
        <a className="brand" href="#top" aria-label="TypeRush dashboard"><BrandMark /><span>TypeRush</span></a>
        <button className="back-button room-back-button" type="button" onClick={onBack}><span aria-hidden="true">←</span> Dashboard</button>
      </header>
      <section className="dashboard-shell join-room-shell" aria-labelledby="join-room-title">
        <div className="join-room-copy">
          <p className="eyebrow"><span className="status-dot" /> MULTIPLAYER RACE</p>
          <h1 id="join-room-title">Join your crew.</h1>
          <p>Enter the eight-character code shared by your host to take your place on the start line.</p>
        </div>

        <div className="join-room-layout">
          <form className="dashboard-card join-room-card" onSubmit={onJoin}>
            <div className="join-room-card-head"><span className="room-section-label">ROOM INVITE</span><span className="join-code-length">{roomCode.length} / 8</span></div>
            <label htmlFor="room-code">Invite code</label>
            <input id="room-code" value={roomCode} onChange={updateCode} placeholder="ABCD2345" maxLength="8" disabled={Boolean(busy)} autoFocus autoCapitalize="characters" autoComplete="off" spellCheck="false" />
            <p className="join-room-help">Codes use eight letters and numbers. They are not case-sensitive.</p>
            {notice && <p className="join-room-notice" role="alert">{notice}</p>}
            <button className="join-room-submit" type="submit" disabled={Boolean(busy)}>{busy === 'join' ? 'Joining race…' : 'Join room'} <span aria-hidden="true">→</span></button>
          </form>

          <aside className="join-room-aside" aria-label="Joining a room">
            <span className="room-section-label">READY, SET, TYPE</span>
            <div className="join-room-orbit" aria-hidden="true"><span>TR</span></div>
            <h2>Race with friends in real time.</h2>
            <p>Once you join, your host will see you in the lobby and can start the race when everyone is ready.</p>
          </aside>
        </div>
      </section>
      <footer className="dashboard-footer">© 2026 TypeRush <span>•</span> Built for people who like to move fast.</footer>
    </main>
  )
}

function RoomPage({ room, onBack, onRaceCountdown }) {
  const [hasCopied, setHasCopied] = useState(false)
  const roomStatus = String(room.status || 'Waiting')

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard?.writeText(room.roomCode)
    } catch {
      // The code remains selectable if clipboard access is unavailable.
    }
    setHasCopied(true)
    window.setTimeout(() => setHasCopied(false), 1800)
  }

  return (
    <main className="dashboard-page room-page">
      <header className="dashboard-header">
        <a className="brand" href="#top" aria-label="TypeRush room"><BrandMark /><span>TypeRush</span></a>
        <button className="back-button room-back-button" type="button" onClick={onBack}><span aria-hidden="true">←</span> Dashboard</button>
      </header>
      <section className="dashboard-shell room-shell" aria-label="Room summary">
        <div className="room-intro">
          <p className="eyebrow"><span className="status-dot" /> RACE TOGETHER</p>
          <h1>Your room is ready.</h1>

          <p>Invite your crew and get set for the start line.</p>
        </div>

        <div className="room-live-layout">
          <section className="dashboard-card room-summary" aria-label="Room invitation">
            <div className="room-summary-head">
              <div><span className="room-section-label">INVITE CODE</span><p>Share this code so friends can join your race.</p></div>
              <span className={`room-status status-${roomStatus.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}><i /> {roomStatus}</span>
            </div>
            <div className="room-code-panel">
              <strong className="room-code">{room.roomCode}</strong>
              <button className="copy-code-button" type="button" onClick={copyRoomCode} aria-label="Copy room code">
                <span aria-hidden="true">{hasCopied ? '✓' : '⧉'}</span> {hasCopied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <div className="room-details" aria-label="Room details">
              <div><span>RACE STATUS</span><strong>{roomStatus}</strong></div>
              <div><span>RACE LENGTH</span><strong>{room.durationSeconds} seconds</strong></div>
              <div><span>YOUR SEAT</span><strong>Joined</strong></div>
            </div>
          </section>

          <aside className="room-next-steps" aria-label="Next steps">
            <span className="room-section-label">WHAT'S NEXT</span>
            <ol>
              <li><span>01</span><p>Send the invite code to your friends.</p></li>
              <li><span>02</span><p>Wait for everyone to join the room.</p></li>
              <li><span>03</span><p>Check the player list below. Race start is coming next.</p></li>
            </ol>
            <p className="room-return-note"><span aria-hidden="true">↗</span> Returning to the dashboard keeps your place in this room.</p>
          </aside>
          <LiveLobby raceId={room.raceId} onRaceCountdown={onRaceCountdown} />
        </div>
      </section>
      <footer className="dashboard-footer">© 2026 TypeRush <span>•</span> Built for people who like to move fast.</footer>
    </main>
  )
}

function RaceArena({ race: initialRace, displayName, onBack }) {
  const [race, setRace] = useState(initialRace)
  const [clockOffset, setClockOffset] = useState(() => getServerClockOffset(initialRace))
  const [input, setInput] = useState('')
  const [connectionState, setConnectionState] = useState('Connecting')
  const [error, setError] = useState('')
  const [racers, setRacers] = useState([])
  const [now, setNow] = useState(Date.now())
  const inputRef = useRef(null)
  const connectionRef = useRef(null)
  const pendingProgress = useRef(null)
  const progressSending = useRef(false)
  const raceId = initialRace.raceId
  const status = String(race?.status || '').toLowerCase()
  const passage = race?.passage || ''
  const startsAt = race?.startsAtUtc ? new Date(race.startsAtUtc).getTime() - clockOffset : null
  const endsAt = race?.endsAtUtc ? new Date(race.endsAtUtc).getTime() - clockOffset : null
  const isRunning = status === 'running' && Boolean(passage)
  const isComplete = Boolean(endsAt && now >= endsAt) || (Boolean(passage) && input === passage)
  const countdown = startsAt && status === 'countdown' ? Math.max(0, Math.ceil((startsAt - now) / 1000)) : 0
  const typedLength = input.length
  const correctCharacters = input.split('').reduce((total, character, index) => total + (character === passage[index] ? 1 : 0), 0)
  const accuracy = typedLength ? Math.round((correctCharacters / typedLength) * 100) : 100
  const elapsedMilliseconds = startsAt && now > startsAt ? now - startsAt : 0
  const wpm = elapsedMilliseconds ? Math.round((correctCharacters * 12000) / elapsedMilliseconds) : 0
  const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const connection = createRaceHubConnection()
    connectionRef.current = connection
    const updateRace = nextRace => {
      if (!nextRace) return
      setRace(nextRace)
      setClockOffset(getServerClockOffset(nextRace))
      if (String(nextRace.status || '').toLowerCase() === 'running') {
        window.requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
    const onProgress = progress => {
      if (!progress || progress.raceId !== raceId) return
      setRacers(current => [...current.filter(racer => racer.userId !== progress.userId), progress])
    }
    connection.on('RaceCountdownStarted', updateRace)
    connection.on('RaceStarted', updateRace)
    connection.on('RaceCompleted', updateRace)
    connection.on('ParticipantProgress', onProgress)
    connection.onreconnecting(() => setConnectionState('Reconnecting'))
    connection.onreconnected(async () => {
      setConnectionState('Connected')
      try {
        await connection.invoke('SubscribeToRoom', raceId)
        updateRace(await connection.invoke('GetRace', raceId))
        setError('')
      } catch { setError('Unable to restore the live race connection.') }
    })
    connection.onclose(() => setConnectionState('Disconnected'))
    const connect = async () => {
      try {
        await connection.start()
        await connection.invoke('SubscribeToRoom', raceId)
        updateRace(await connection.invoke('GetRace', raceId))
        setConnectionState('Connected')
        setError('')
      } catch {
        setConnectionState('Disconnected')
        setError('Unable to connect to the live race. Return to the room and reconnect.')
      }
    }
    void connect()
    return () => {
      connection.off('RaceCountdownStarted', updateRace)
      connection.off('RaceStarted', updateRace)
      connection.off('RaceCompleted', updateRace)
      connection.off('ParticipantProgress', onProgress)
      void connection.stop().catch(() => {})
      if (connectionRef.current === connection) connectionRef.current = null
    }
  }, [raceId])

  const reportProgress = () => {
    if (progressSending.current || !connectionRef.current) return
    progressSending.current = true
    const send = async () => {
      while (pendingProgress.current && connectionRef.current) {
        const next = pendingProgress.current
        pendingProgress.current = null
        try {
          await connectionRef.current.invoke('ReportProgress', raceId, next)
        } catch {
          setError('Live progress could not be sent. Your typing is still visible here.')
        }
      }
      progressSending.current = false
    }
    void send()
  }

  const handleInput = event => {
    if (!isRunning || isComplete) return
    const nextInput = event.target.value.slice(0, passage.length)
    const nextCorrect = nextInput.split('').reduce((total, character, index) => total + (character === passage[index] ? 1 : 0), 0)
    setInput(nextInput)
    pendingProgress.current = {
      correctCharacters: nextCorrect,
      totalCharacterAttempts: nextInput.length,
      correctCharacterAttempts: nextCorrect,
    }
    reportProgress()
  }

  const timerLabel = status === 'countdown' ? 'STARTS IN' : 'TIME LEFT'
  const timerValue = status === 'countdown'
    ? String(countdown || 0).padStart(2, '0')
    : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <main className="practice-page race-arena-page">
      <header className="practice-header">
        <button className="back-button" type="button" onClick={onBack}><span aria-hidden="true">←</span> Room</button>
        <a className="brand" href="#top" aria-label="TypeRush arena"><BrandMark /><span>TypeRush</span></a>
        <span className="practice-user">{connectionState} · {displayName || 'Racer'}</span>
      </header>
      <section className="practice-shell" aria-label="Live typing arena">
        <div className="practice-title-row">
          <div><p className="eyebrow"><span className="status-dot" /> LIVE MULTIPLAYER RACE</p><h1>{status === 'countdown' ? 'Get ready.' : isComplete ? 'Race complete.' : 'Type fast. Stay precise.'}</h1><p>{status === 'countdown' ? 'Both racers are moving to the arena.' : 'Your progress is visible to everyone in the race.'}</p></div>
          <div className={`timer ${isRunning ? 'is-running' : ''}`} aria-label={timerLabel}><span>{timerLabel}</span><strong>{timerValue}</strong></div>
        </div>
        {error && <p className="arena-error" role="alert">{error}</p>}
        <section className="typing-card" aria-label="Race passage">
          <div className="typing-card-head"><span>{status === 'countdown' ? `TYPING UNLOCKS IN ${countdown || 0}` : isComplete ? 'RACE FINISHED' : isRunning ? 'GO — TYPE THE PASSAGE' : 'CONNECTING TO RACE'}</span><span>{typedLength} / {passage.length || '—'} characters</span></div>
          <p className="typing-passage" aria-hidden="true">{passage ? passage.split('').map((character, index) => <span key={`${character}-${index}`} className={index < typedLength ? (input[index] === character ? 'correct' : 'incorrect') : index === typedLength && isRunning ? 'current-character' : ''}>{character}</span>) : 'Your passage will appear when the countdown ends.'}</p>
          <label className="sr-only" htmlFor="race-input">Type the race passage</label>
          <textarea ref={inputRef} id="race-input" className="practice-input" value={input} onChange={handleInput} disabled={!isRunning || isComplete} placeholder={status === 'countdown' ? 'Typing unlocks at GO…' : 'Waiting for the race to start…'} spellCheck="false" autoCapitalize="off" autoComplete="off" />
          <div className="typing-hint">{status === 'countdown' ? <><span className="keyboard-key">LOCKED</span> Watch the countdown — the typing field activates at GO.</> : <><span className="keyboard-key">LIVE</span> WPM and accuracy update for both racers as you type.</>}</div>
        </section>
        <section className="live-stats" aria-label="Your live typing statistics">
          <article><span className="stat-icon" aria-hidden="true">↗</span><p>Speed</p><strong>{wpm} <small>WPM</small></strong></article>
          <article><span className="stat-icon" aria-hidden="true">◎</span><p>Accuracy</p><strong>{accuracy}<small>%</small></strong></article>
          <article><span className="stat-icon" aria-hidden="true">⌁</span><p>Characters</p><strong>{correctCharacters}<small> / {typedLength}</small></strong></article>
        </section>
        <section className="arena-racers" aria-label="Live racer progress">
          <div><span className="room-section-label">LIVE RACEBOARD</span><strong>Everyone’s pace, live.</strong></div>
          {racers.length ? <ul>{racers.map(racer => <li key={racer.userId}><span className="race-avatar">{String(racer.userId).slice(0, 1).toUpperCase()}</span><span className="race-racer-name">Racer<small>{racer.correctCharacters} / {racer.passageLength} characters</small></span><strong>{Math.round(racer.wpm || 0)} <small>WPM</small></strong><em>{Math.round(racer.accuracyPercentage || 0)}%</em></li>)}</ul> : <p>Waiting for live typing updates from the racers.</p>}
        </section>
      </section>
    </main>
  )
}

function getServerClockOffset(race) {
  const serverTime = race?.serverTimeUtc ? new Date(race.serverTimeUtc).getTime() : null
  return serverTime ? serverTime - Date.now() : 0
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
