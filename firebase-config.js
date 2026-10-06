// Completează acest fișier cu datele din Firebase Console > Project settings > Your apps > Web app.
// Firebase Web API keys sunt identificatori de configurare pentru client; securitatea reală este în firestore.rules.

export const firebaseConfig = {
  apiKey: "AIzaSyBAfEgkKFrCHIH2yGVoXyQ_TUXs8JO_4E4",
  authDomain: "chatbaby-66b5a.firebaseapp.com",
  projectId: "chatbaby-66b5a",
  storageBucket: "chatbaby-66b5a.firebasestorage.app",
  messagingSenderId: "249205732814",
  appId: "1:249205732814:web:4904e164c8399fa3e2e79f",
  measurementId: "G-NT1GELVH54"
};

// Pune aici UID-urile celor două conturi create manual în Firebase Authentication.
// Numele sunt doar pentru afișare în chat și pot fi schimbate.
export const allowedUsers = [
  { uid: "Y2FGPwxkZZPRkcWwqs1OFjzHRao1", name: "User 1" },
  { uid: "9kw8hR5wOLQuPvEmQCJiTX0nQj83", name: "User 2" }
];

export const chatConfig = {
  pageSize: 50,
  maxMessageLength: 2000
};
