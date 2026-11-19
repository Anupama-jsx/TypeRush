import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr'
import { baseUrl, requireToken } from '../api/client'

export function createRaceHubConnection() {
  return new HubConnectionBuilder()
    .withUrl(`${baseUrl}/hubs/race`, {
      transport: HttpTransportType.WebSockets,
      accessTokenFactory: requireToken,
      withCredentials: false,
    })
    .withAutomaticReconnect([0, 2000, 10000, 30000])
    .configureLogging(LogLevel.None)
    .build()
}

// Serial reads prevent a slower old response from overwriting newer lobby data.
export function startLobbySession(connection, raceId, { onState, onLobby, onError, onRace = () => {} }) {
  let disposed = false
  let subscribed = false
  let reading = false
  let dirty = false
  let generation = 0
  const refresh = async () => {
    dirty = true
    if (disposed || !subscribed || reading) return
    reading = true
    try {
      while (dirty && subscribed && !disposed) {
        dirty = false
        const version = generation
        const lobby = await connection.invoke('GetLobby', raceId)
        if (!disposed && subscribed && version === generation) {
          onLobby(lobby)
          onError('')
        }
      }
    } catch {
      if (!disposed && subscribed) onError('Could not load participants. Try Refresh participants.')
    } finally {
      reading = false
      if (dirty && subscribed && !disposed) void refresh()
    }
  }
  const subscribe = async () => {
    try {
      await connection.invoke('SubscribeToRoom', raceId)
      if (disposed) return
      subscribed = true
      onState('Connected')
      await refresh()
      const race = await connection.invoke('GetRace', raceId)
      if (!disposed && race) onRace({ phase: String(race.status || '').toLowerCase(), race })
    } catch {
      if (!disposed) {
        onError('Unable to subscribe to this room. Check your membership and try reconnecting.')
        await connection.stop()
      }
    }
  }
  const changed = id => { if (id === raceId) void refresh() }
  const countdownStarted = race => { if (!disposed) onRace({ phase: 'countdown', race }) }
  const raceStarted = race => { if (!disposed) onRace({ phase: 'started', race }) }
  const participantProgressed = progress => { if (!disposed) onRace({ phase: 'progress', progress }) }
  connection.on('LobbyChanged', changed)
  connection.on('RaceCountdownStarted', countdownStarted)
  connection.on('RaceStarted', raceStarted)
  connection.on('ParticipantProgress', participantProgressed)
  connection.onreconnecting(() => {
    subscribed = false
    generation++
    if (!disposed) onState('Reconnecting')
  })
  connection.onreconnected(() => { if (!disposed) void subscribe() })
  connection.onclose(() => {
    subscribed = false
    generation++
    if (!disposed) onState('Disconnected')
  })
  const ready = (async () => {
    try {
      await connection.start()
      if (!disposed) await subscribe()
    } catch {
      if (!disposed) {
        onState('Disconnected')
        onError('Unable to connect to the live lobby. Check that the updated backend is running, then retry.')
      }
    }
  })()
  return {
    ready, refresh,
    async startRace() {
      if (disposed || !subscribed) throw new Error('The live lobby is not connected yet.')
      const race = await connection.invoke('StartRace', raceId)
      if (!disposed && race) onRace({ phase: 'started', race })
      return race
    },
    stop() {
      disposed = true
      subscribed = false
      connection.off('LobbyChanged', changed)
      connection.off('RaceCountdownStarted', countdownStarted)
      connection.off('RaceStarted', raceStarted)
      connection.off('ParticipantProgress', participantProgressed)
      return connection.stop()
    },
  }
}
