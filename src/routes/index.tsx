// A tiny "signed guestbook" built with Dynamic.
// Visitors log in (email, social, or wallet), write a note, and sign it
// with their wallet. Entries are stored in D1 (see functions/api/entries.ts)
// and re-verified server-side, so anyone loading the page can trust who
// wrote each note.
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  DynamicWidget,
  useDynamicContext,
  useIsLoggedIn,
} from '@dynamic-labs/sdk-react-core'

type Entry = {
  id: string
  text: string
  address: string
  signature: string
  verified: boolean
  at: string
}

// `fetch` against a route the API doesn't serve (e.g. running `pnpm dev`
// instead of `pnpm pages:dev`) returns the SPA's index.html, not JSON.
// Surface that as a clear message instead of a raw JSON parse error.
async function parseJsonResponse(res: Response): Promise<any> {
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(
      "API didn't return JSON — is the API running? Use `pnpm pages:dev`, not `pnpm dev`.",
    )
  }
  return res.json()
}

async function fetchEntries(): Promise<Entry[]> {
  const res = await fetch('/api/entries')
  const body = await parseJsonResponse(res)
  if (!res.ok) throw new Error(body.error ?? `GET /api/entries failed: ${res.status}`)
  return body
}

export const Route = createFileRoute('/')({
  loader: async () => {
    try {
      return { entries: await fetchEntries(), loadError: null as string | null }
    } catch (e) {
      console.error('Failed to load guestbook entries', e)
      return {
        entries: [] as Entry[],
        loadError:
          "Couldn't load existing entries — the /api isn't reachable. Run `pnpm pages:dev` instead of `pnpm dev` to serve it locally.",
      }
    }
  },
  component: Guestbook,
})

function Guestbook() {
  const { entries: initialEntries, loadError } = Route.useLoaderData()
  const isLoggedIn = useIsLoggedIn()
  const { primaryWallet, user } = useDynamicContext()
  const [note, setNote] = useState('')
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState(loadError ?? '')

  async function signNote() {
    if (!note.trim() || !primaryWallet) return
    setSigning(true)
    setError('')
    try {
      const signature = await primaryWallet.signMessage(note)
      if (!signature) throw new Error('No signature returned')

      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: note,
          address: primaryWallet.address,
          signature,
        }),
      })
      const body = await parseJsonResponse(res)
      if (!res.ok) throw new Error(body.error ?? `Server rejected the entry (${res.status})`)

      setEntries((prev) => [body as Entry, ...prev])
      setNote('')
    } catch (e) {
      console.error('Failed to sign or save guestbook note', e)
      setError(
        e instanceof Error ? e.message : 'Signing was cancelled or failed. Try again.',
      )
    } finally {
      setSigning(false)
    }
  }

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

  return (
    <main style={styles.page}>
      <h1 style={{ marginBottom: 4 }}>Signed guestbook</h1>
      <DynamicWidget />

      {!isLoggedIn ? (
        <p style={styles.muted}>Log in to leave a signed note.</p>
      ) : (
        <div>
          <p style={styles.muted}>
            Signed in as {user?.email ?? short(primaryWallet?.address ?? '')}
          </p>
          <textarea
            style={styles.input}
            rows={3}
            placeholder="Say hello"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            style={styles.button}
            onClick={signNote}
            disabled={signing || !note.trim() || !primaryWallet}
          >
            {signing
              ? 'Waiting for signature…'
              : !primaryWallet
                ? 'Wallet loading…'
                : 'Sign and post'}
          </button>
          {error && <p style={styles.error}>{error}</p>}

          <ul style={styles.list}>
            {entries.map((e) => (
              <li key={e.id} style={styles.entry}>
                <div>{e.text}</div>
                <small style={styles.muted}>
                  {short(e.address)} · sig {e.signature.slice(0, 12)}… ·{' '}
                  {e.verified ? '✓ verified' : '✗ invalid'}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}

const styles = {
  page: { maxWidth: 520, margin: '48px auto', padding: 16, fontFamily: 'system-ui, sans-serif' },
  muted: { color: '#666' },
  input: { width: '100%', padding: 10, fontSize: 16, boxSizing: 'border-box', marginTop: 12 },
  button: { marginTop: 8, padding: '10px 16px', fontSize: 16, cursor: 'pointer' },
  error: { color: '#b00020' },
  list: { listStyle: 'none', padding: 0, marginTop: 24 },
  entry: { borderTop: '1px solid #ddd', padding: '12px 0' },
} as const
