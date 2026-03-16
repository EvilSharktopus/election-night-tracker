import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBsrH0RV3_nAGnxgCdWl9VcgnZMBCwwvrY",
  authDomain: "election-night-d348c.firebaseapp.com",
  projectId: "election-night-d348c",
  storageBucket: "election-night-d348c.firebasestorage.app",
  messagingSenderId: "795467552999",
  appId: "1:795467552999:web:f978cbfc8df919e80b2a42",
  // Default US Realtime Database URL. If your project uses a different region,
  // replace this with the URL shown in Firebase Console → Realtime Database.
  databaseURL: "https://election-night-d348c-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
