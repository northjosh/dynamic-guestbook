// Cloudflare Pages Function — backs the guestbook with D1 so entries are
// shared across every visitor, not just the browser that wrote them.
import { recoverMessageAddress } from 'viem'

interface Env {
  DB: D1Database
}

interface EntryRow {
  id: string
  text: string
  address: string
  signature: string
  verified: number
  created_at: string
}

const MAX_TEXT_LENGTH = 500
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SIGNATURE_RE = /^0x[0-9a-fA-F]+$/

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    'SELECT id, text, address, signature, verified, created_at FROM entries ORDER BY created_at DESC LIMIT 50',
  ).all<EntryRow>()

  return Response.json(
    results.map((row) => ({
      id: row.id,
      text: row.text,
      address: row.address,
      signature: row.signature,
      verified: row.verified === 1,
      at: row.created_at,
    })),
  )
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { text, address, signature } = (body ?? {}) as Record<string, unknown>

  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    return Response.json({ error: 'text must be 1-500 characters' }, { status: 400 })
  }
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) {
    return Response.json({ error: 'address must be a checksummed 0x address' }, { status: 400 })
  }
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) {
    return Response.json({ error: 'signature must be 0x-prefixed hex' }, { status: 400 })
  }

  // Re-verify server-side. Never trust the client's own claim that a
  // signature matches an address — recompute it ourselves before persisting.
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message: text,
      signature: signature as `0x${string}`,
    })
  } catch {
    return Response.json({ error: 'Could not recover an address from that signature' }, { status: 400 })
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return Response.json(
      { error: 'Signature does not match the claimed address' },
      { status: 401 },
    )
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await env.DB.prepare(
    'INSERT INTO entries (id, text, address, signature, verified, created_at) VALUES (?, ?, ?, ?, 1, ?)',
  )
    .bind(id, text, address, signature, createdAt)
    .run()

  return Response.json(
    { id, text, address, signature, verified: true, at: createdAt },
    { status: 201 },
  )
}
