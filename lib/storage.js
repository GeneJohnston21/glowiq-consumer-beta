/**
 * storage.js — drop-in replacement for the artifact's window.storage API.
 * Backed by the user_storage table in Supabase.
 *
 * API mirrors window.storage exactly:
 *   storage.get(key, shared?)    → { key, value } | null
 *   storage.set(key, val, shared?) → { key, value } | null
 *   storage.delete(key, shared?)  → { key, deleted } | null
 */

import { getSupabase } from './supabase'

const getUser = async () => {
  const { data: { user } } = await getSupabase().auth.getUser()
  return user
}

const buildQuery = (query, shared, userId) =>
  shared ? query.is('user_id', null) : query.eq('user_id', userId)

export const storage = {
  async get(key, shared = false) {
    try {
      const user = await getUser()
      if (!shared && !user) return null

      const query = buildQuery(
        getSupabase().from('user_storage').select('value').eq('key', key).eq('is_shared', shared),
        shared,
        user?.id
      )
      const { data, error } = await query.maybeSingle()
      if (error || !data) return null
      return { key, value: data.value }
    } catch (e) {
      console.error('storage.get error', e)
      return null
    }
  },

  async set(key, value, shared = false) {
    try {
      const supabase = getSupabase()
      const user = await getUser()
      if (!shared && !user) return null

      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      const userId = shared ? null : user.id
      const now = new Date().toISOString()

      // Check if row already exists
      const { data: existing } = await buildQuery(
        supabase.from('user_storage').select('id').eq('key', key).eq('is_shared', shared),
        shared,
        userId
      ).maybeSingle()

      if (existing) {
        await supabase
          .from('user_storage')
          .update({ value: stringValue, updated_at: now })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('user_storage')
          .insert({ key, value: stringValue, is_shared: shared, user_id: userId, updated_at: now })
      }

      return { key, value: stringValue }
    } catch (e) {
      console.error('storage.set error', e)
      return null
    }
  },

  async delete(key, shared = false) {
    try {
      const supabase = getSupabase()
      const user = await getUser()
      if (!shared && !user) return null

      const { error } = await buildQuery(
        supabase.from('user_storage').delete().eq('key', key).eq('is_shared', shared),
        shared,
        user?.id
      )
      if (error) throw error
      return { key, deleted: true }
    } catch (e) {
      console.error('storage.delete error', e)
      return null
    }
  },

  async uploadPhoto(analysisId, dataUrl) {
    const supabase = getSupabase()
    if (!supabase) return null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const res  = await fetch(dataUrl)
      const blob = await res.blob()
      const path = `${user.id}/${analysisId}.jpg`
      const { error } = await supabase.storage
        .from('analysis-photos')
        .upload(path, blob, { contentType:'image/jpeg', upsert:true })
      if (error) { console.error('Photo upload:', error); return null }
      return path
    } catch(e) {
      console.error('Photo upload error:', e)
      return null
    }
  },
}
