import { useEffect, useState } from 'react'
import { createRaceHubConnection, startLobbySession } from '../realtime/lobbySession'

export function LiveLobby({ raceId, onRaceCountdown }) {
  const [attempt, setAttempt] = useState(0)
  return <LobbyConnection key={`${raceId}:${attempt}`} raceId={raceId} onRaceCountdown={onRaceCountdown} onRetry={() => setAttempt(value => value + 1)} />
}

function LobbyConnection({ raceId, onRaceCountdown, onRetry }) {
  const [status, setStatus] = useState('Connecting')
  const [lobby, setLobby] = useState(null)
  const [error, setError] = useState('')
  const [session, setSession] = useState(null)
  const [startState, setStartState] = useState('idle')
  const [raceUpdate, setRaceUpdate] = useState(null)

  useEffect(() => {
    const connection = createRaceHubConnection()
    const active = startLobbySession(connection, raceId, {
      onState: setStatus, onLobby: setLobby, onError: setError,
      onRace: update => {
        setRaceUpdate(update)
        if ((update.phase === 'countdown' || update.phase === 'started') && update.race) onRaceCountdown(update.race)
      },
    })
    // Register the refresh action once the connection attempt settles.
    let mounted = true
    void active.ready.then(() => { if (mounted) setSession(active) })
    return () => { mounted = false; void active.stop().catch(() => {}) }
  }, [raceId])

  const isHost = lobby?.currentUserId === lobby?.hostUserId && Boolean(lobby)
  const canStart = isHost && lobby?.participants.length >= 2 && status === 'Connected' && Boolean(session)
  const connectionLabel = status === 'Connected' ? 'Live updates connected' : status === 'Connecting' ? 'Connecting to lobby' : `${status} updates`
  const playerCount = lobby ? `${lobby.participants.length} / ${lobby.maxParticipants}` : '— / —'
  const racePhase = raceUpdate?.phase
  const liveRacers = raceUpdate?.race?.participants || raceUpdate?.race?.racers || []

  const startRace = async () => {
    if (!session || !canStart) return
    setStartState('starting')
    setError('')
    try {
      const race = await session.startRace()
      const stillActive = race?.endsAtUtc && new Date(race.endsAtUtc) > new Date()
      if (race && (String(race.status || '').toLowerCase() === 'countdown' || stillActive)) {
        setStartState('started')
        onRaceCountdown(race)
      } else {
        setStartState('idle')
        setError('This race has already ended. Create a new room to start another race.')
      }
    } catch {
      setStartState('idle')
      setError('Unable to start the race. Check that both players are connected, then try again.')
    }
  }
  return (
    <section className="dashboard-card live-lobby" aria-label="Room participants">
      <div className="live-lobby-head">
        <div><span className="room-section-label">RACE LOBBY</span><h2>Players <em>{playerCount}</em></h2></div>
        <p className={`lobby-connection ${status === 'Connected' ? 'is-connected' : ''}`} role="status"><i /> {connectionLabel}</p>
      </div>
      {error && <p className="lobby-error" role="alert">{error}</p>}
      {lobby && <>
        <ul className="lobby-players">{lobby.participants.map(player => <li key={player.userId}>
          <span className="player-avatar" aria-hidden="true">{player.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="player-name">{player.displayName}<small>{player.userId === lobby.currentUserId ? 'You' : 'Racer'}</small></span>
          {player.userId === lobby.hostUserId ? <strong className="host-badge">Host</strong> : <span className="player-ready">Ready</span>}
        </li>)}</ul>
        <div className="lobby-footer">
          <div><p className="lobby-message">{isHost ? lobby.participants.length < 2 ? 'You are the host. Invite another player to join.' : 'Your players have joined. Get ready to start.' : 'Waiting for the host to start the race.'}</p><p className="lobby-note">This list shows joined players, not online presence.</p></div>
          <div className="lobby-actions">
            {status === 'Disconnected' && <button className="action-button secondary-action" type="button" onClick={onRetry}>Reconnect</button>}
            {isHost && <button className="action-button start-race-button" type="button" disabled={!canStart || startState === 'starting' || startState === 'started'} onClick={startRace}>{startState === 'starting' ? 'Starting…' : startState === 'started' ? 'Race started' : 'Start race'} <span aria-hidden="true">→</span></button>}
            <button className="action-button secondary-action" type="button" disabled={status !== 'Connected' || !session} onClick={() => void session.refresh()}>Refresh <span aria-hidden="true">↻</span></button>
          </div>
        </div>
        {racePhase && <section className={`live-race-update is-${racePhase}`} aria-live="polite">
          <div><span className="room-section-label">LIVE RACE</span><strong>{racePhase === 'finished' ? 'Race complete.' : racePhase === 'started' ? 'Race is starting.' : 'Race in progress.'}</strong></div>
          {liveRacers.length > 0 && <ul>{liveRacers.map((racer, index) => <li key={racer.userId || racer.id || index}><span>{racer.displayName || racer.username || `Racer ${index + 1}`}</span><strong>{racer.wpm ?? racer.wordsPerMinute ?? 0} <small>WPM</small></strong></li>)}</ul>}
        </section>}
      </>}
      {!lobby && <div className="lobby-loading"><span /><span /><span /></div>}
    </section>
  )
}
