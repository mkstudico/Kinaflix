// js/firebase-config.js
// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCBrRTdhrRTRL9ZfZpb-m-1XBmbDIsXF9k",
  authDomain: "kinaflix.firebaseapp.com",
  databaseURL: "https://kinaflix-default-rtdb.firebaseio.com",
  projectId: "kinaflix",
  storageBucket: "kinaflix.firebasestorage.app",
  messagingSenderId: "318239806217",
  appId: "1:318239806217:web:ee98bd97cd2a08ac3239d8",
  measurementId: "G-DC1T9B6B9W"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Auth state listener
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('User logged in:', user.email);
    // User is signed in
    window.currentUser = user;
    
    // Check subscription status
    if (window.checkSubscriptionStatus) {
      window.checkSubscriptionStatus();
    }
  } else {
    console.log('No user logged in');
    window.currentUser = null;
    
    // Redirect to login if on protected page
    if (window.location.pathname.includes('subscribe')) {
      const redirectUrl = encodeURIComponent(window.location.href);
      window.location.href = `/login?redirect=${redirectUrl}`;
    }
  }
});

// Export Firebase instances
window.firebase = firebase;
window.auth = auth;
window.db = db;
