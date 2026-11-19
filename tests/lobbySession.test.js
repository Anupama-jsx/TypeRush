import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startLobbySession } from '../src/realtime/lobbySession.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function setup() {
  const handlers = {}
  const calls = []
  const lists = []
  const races = []
  const states = []
  const errors = []
  const connection = {
    on: (event, callback) => { handlers[event] = callback },
    off: event => { delete handlers[event] },
    onreconnecting: callback => { handlers.reconnecting = callback },
    onreconnected: callback => { handlers.reconnected = callback },
    onclose: callback => { handlers.close = callback },
    start: async () => {},
    stop: async () => { handlers.close() },
    invoke: async (...args) => { calls.push(args); return { participants: [] } },
  }
  const session = startLobbySession(connection, 'race-a', {
    onState: value => states.push(value), onLobby: value => lists.push(value), onError: value => errors.push(value), onRace: value => races.push(value),
  })
  return { connection, session, handlers, calls, lists, races, states, errors }
}

test('subscribes before reading and ignores events for another room', async () => {
  const f = setup()
  await f.session.ready
  assert.deepEqual(f.calls, [['SubscribeToRoom', 'race-a'], ['GetLobby', 'race-a']])
  f.handlers.LobbyChanged('race-b')
  await tick()
  assert.equal(f.calls.length, 2)
  f.handlers.LobbyChanged('race-a')
  await tick()
  assert.equal(f.calls.length, 3)
  await f.session.stop()
})

test('reconnect subscribes again and fetches current membership', async () => {
  const f = setup()
  await f.session.ready
  f.handlers.reconnecting()
  f.handlers.reconnected()
  await tick()
  assert.deepEqual(f.calls.slice(2), [['SubscribeToRoom', 'race-a'], ['GetLobby', 'race-a']])
  assert.deepEqual(f.states, ['Connected', 'Reconnecting', 'Connected'])
  await f.session.stop()
})

test('coalesces changes during a pending read without concurrent reads', async () => {
  const f = setup()
  await f.session.ready
  let finish
  let reads = 0
  f.connection.invoke = async () => {
    reads++
    if (reads === 1) return await new Promise(resolve => { finish = resolve })
    return { participants: ['new'] }
  }
  const pending = f.session.refresh()
  f.handlers.LobbyChanged('race-a')
  f.handlers.LobbyChanged('race-a')
  assert.equal(reads, 1)
  finish({ participants: ['old'] })
  await pending
  assert.equal(reads, 2)
  assert.deepEqual(f.lists.at(-1).participants, ['new'])
  await f.session.stop()
})

test('unmount suppresses pending results and removes the event handler', async () => {
  const f = setup()
  await f.session.ready
  let finish
  f.connection.invoke = () => new Promise(resolve => { finish = resolve })
  const pending = f.session.refresh()
  await f.session.stop()
  finish({ participants: ['late'] })
  await pending
  assert.equal(f.lists.length, 1)
  assert.equal(f.handlers.LobbyChanged, undefined)
})

test('starts a race and publishes live race events for the active room', async () => {
  const f = setup()
  await f.session.ready
  f.connection.invoke = async (...args) => {
    f.calls.push(args)
    return { participants: [{ userId: 'one', displayName: 'Host', wpm: 0 }] }
  }

  await f.session.startRace()
  assert.deepEqual(f.calls.at(-1), ['StartRace', 'race-a'])
  assert.deepEqual(f.races.at(-1), { phase: 'started', race: { participants: [{ userId: 'one', displayName: 'Host', wpm: 0 }] } })

  f.handlers.RaceProgressUpdated({ participants: [{ userId: 'one', displayName: 'Host', wpm: 82 }] })
  assert.deepEqual(f.races.at(-1), { phase: 'racing', race: { participants: [{ userId: 'one', displayName: 'Host', wpm: 82 }] } })
  await f.session.stop()
})
