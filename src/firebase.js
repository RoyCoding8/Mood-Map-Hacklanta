import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

/**
 * Push a new mood pin to the shared Firestore collection.
 * Stores the deviceId alongside the pin so it travels with the document
 * (useful if you later add Firebase Admin-based server verification).
 * Returns the DocumentReference — caller needs the .id for ownership registration.
 */
export async function pushMoodPin({ lat, lng, mood, color, emoji, time, timestamp, deviceId }) {
  return addDoc(collection(db, 'mood_pins'), {
    lat, lng, mood, color, emoji, time, timestamp,
    deviceId:     deviceId || null,  // internal — stripped before handing to the UI
    supportCount: 0,                 // incremented atomically via incrementPinSupport()
  })
}

/**
 * Atomically increment the supportCount on a pin.
 * Uses Firestore's server-side increment so concurrent writes from multiple
 * clients never race or overwrite each other.
 */
export async function incrementPinSupport(pinId) {
  return updateDoc(doc(db, 'mood_pins', pinId), {
    supportCount: increment(1),
  })
}

/**
 * Update mood fields on an existing pin.
 * Only called AFTER the Express backend has verified ownership via PATCH /api/pins/:id.
 */
export async function updateMoodPin(pinId, { mood, color, emoji }) {
  return updateDoc(doc(db, 'mood_pins', pinId), { mood, color, emoji })
}

/**
 * Delete a pin from the shared collection.
 * Only called AFTER the Express backend has verified ownership via DELETE /api/pins/:id.
 */
export async function deleteMoodPin(pinId) {
  return deleteDoc(doc(db, 'mood_pins', pinId))
}

/**
 * Subscribe to the latest 300 community pins in real-time.
 *
 * `onAdded`    — called for every new document (initial load + live inserts).
 * `onModified` — optional; called when an existing document changes (e.g.
 *                supportCount incremented by another client). Pass a handler
 *                to keep the local pin list in sync without a full reload.
 *
 * Returns the unsubscribe function to clean up on unmount.
 */
export function subscribeToPins(onAdded, onModified) {
  const q = query(
    collection(db, 'mood_pins'),
    orderBy('timestamp', 'asc'),
    limit(300),
  )
  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      // Strip deviceId before handing anything to the UI — it's internal
      const { deviceId: _omit, ...pinData } = change.doc.data()
      const pin = { id: change.doc.id, ...pinData }

      if (change.type === 'added')               onAdded(pin)
      if (change.type === 'modified' && onModified) onModified(pin)
    })
  })
}
