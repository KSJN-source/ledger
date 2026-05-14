import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCsY3pkSScO6JBGxXAqdrg9E8aS2qJejiE",
  authDomain: "ledger-40f70.firebaseapp.com",
  projectId: "ledger-40f70",
  storageBucket: "ledger-40f70.firebasestorage.app",
  messagingSenderId: "110374097637",
  appId: "1:110374097637:web:a0f636f17fd2b41099ba0c"
};

export const db = getFirestore(initializeApp(firebaseConfig));