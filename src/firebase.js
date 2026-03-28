import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
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
    deviceId: deviceId || null,   // stored but intentionally not exposed to the map UI
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
 * `onAdded` is called once per new document that arrives — including the
 * initial load and any subsequent writes from other clients.
 * Returns the unsubscribe function to clean up on unmount.
 */
export function subscribeToPins(onAdded) {
  const q = query(
    collection(db, 'mood_pins'),
    orderBy('timestamp', 'asc'),
    limit(300),
  )
  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data()
        // Strip deviceId before handing the pin to the UI — it's internal
        const { deviceId: _omit, ...pinData } = data
        onAdded({ id: change.doc.id, ...pinData })
      }
    })
  })
}
