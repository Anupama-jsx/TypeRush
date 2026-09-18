import { useState } from 'react'
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

function App() {
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
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5206'}${endpoint}`, {
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

        if (!accessToken || !tokenType || !expiresAtUtc) {
          throw new Error('The login response was missing authentication details. Please try again.')
        }

        const storage = rememberMe ? localStorage : sessionStorage
        storage.setItem('typerush.auth', JSON.stringify({ accessToken, tokenType, expiresAtUtc }))
        setFormValues((current) => ({ ...current, password: '' }))
        setAuthState({ status: 'success', message: 'Logged in successfully.' })
      } else {
        setAuthState({ status: 'success', message: 'Account created successfully. You can now log in.' })
        setFormValues({ displayName: '', email: '', password: '' })
      }
    } catch (error) {
      setAuthState({ status: 'error', message: error instanceof Error ? error.message : (isLogin ? 'Unable to log in. Please try again.' : 'Unable to create your account. Please try again.') })
    }
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

function Racer({ initial, name, speed, progress, color }) {
  return <div className="racer"><span className={`avatar ${color}`}>{initial}</span><span className="racer-name">{name}</span><span className="race-progress"><i style={{ width: progress }} /></span><strong>{speed} <small>wpm</small></strong></div>
}

export default App
