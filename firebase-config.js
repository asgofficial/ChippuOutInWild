// ══════════════════════════════════════════════════════════════════
// FIREBASE CONFIG — replace with YOUR project's values.
// Get these from: Firebase Console → Project settings → General →
// "Your apps" → Web app → SDK setup and configuration → Config
// ══════════════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBgUlRfebnnT-74tkn_Br1BtGf99p2B7ic",
  authDomain: "flapychippu.firebaseapp.com",
  projectId: "flapychippu",
  storageBucket: "flapychippu.firebasestorage.app",
  messagingSenderId: "1071200266573",
  appId: "1:1071200266573:web:3091539ae12973e2cf2f04",
  measurementId: "G-3NWYPHTDHP"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
