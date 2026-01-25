import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

// Your Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCBrRTdhrRTRL9ZfZpb-m-1XBmbDIsXF9k",
    authDomain: "kinaflix.firebaseapp.com",
    projectId: "kinaflix",
    storageBucket: "kinaflix.appspot.com",
    messagingSenderId: "318239806217",
    appId: "1:318239806217:web:ee98bd97cd2a08ac3239d8",
    measurementId: "G-DC1T9B6B9W"
};

// Initialize specific instance for the checker
const app = initializeApp(firebaseConfig, "CheckerApp"); 
const auth = getAuth(app);
const db = getFirestore(app);

const adContainerId = 'kinaflix-ad-container';

function init() {
    console.log('Subscription Checker (Modern): Starting...');
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await checkSubscription(user.uid);
        } else {
            showAds(); // Not logged in = Show Ads
        }
    });
}

async function checkSubscription(userId) {
    try {
        const docRef = doc(db, 'users', userId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showAds();
            return;
        }

        const data = docSnap.data();
        
        if (data.subscriptionEnd) {
            const endDate = new Date(data.subscriptionEnd);
            const now = new Date();

            if (endDate > now) {
                console.log('User is Premium. Hiding Ads.');
                hideAds();
            } else {
                console.log('Subscription Expired. Showing Ads.');
                showAds();
            }
        } else {
            showAds();
        }

    } catch (error) {
        console.error('Error checking subscription:', error);
        showAds(); 
    }
}

function showAds() {
    const container = document.getElementById(adContainerId);
    if (container) {
        container.style.display = 'block';
        container.innerHTML = ''; 
        
        // 1. Create the "Pay to Remove" Banner
        const banner = document.createElement('div');
        banner.style.cssText = 'background: #e50914; color: white; padding: 12px; margin-bottom: 15px; border-radius: 4px; font-weight: bold; font-family: sans-serif; font-size: 14px;';
        banner.innerHTML = `
            <span>🎬 Want an ad-free experience? </span>
            <a href="subscribe.html" style="color: white; text-decoration: underline; margin-left: 5px;">Subscribe now for just 1445 RWF!</a>
        `;
        
        // 2. Create the Google Ad Script
        const script = document.createElement('script');
        script.async = true;
        script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6280599021277554";
        script.crossOrigin = "anonymous";
        
        container.appendChild(banner);
        container.appendChild(script);
        console.log('Ads + Banner Injected.');
    }
}

function hideAds() {
    const container = document.getElementById(adContainerId);
    if (container) {
        container.style.display = 'none';
        container.innerHTML = ''; 
    }
}

// Start immediately
init();
