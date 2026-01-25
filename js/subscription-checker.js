// js/subscription-checker.js
class SubscriptionChecker {
    constructor() {
        this.adContainerId = 'kinaflix-ad-container'; // The ID we will use in HTML
    }

    async init() {
        console.log('Subscription Checker: Starting...');
        this.setupAuthListener();
    }

    setupAuthListener() {
        if (!window.firebase || !window.firebase.auth) return;
        
        window.firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                await this.checkSubscription(user.uid);
            } else {
                this.showAds(); // Not logged in = Show Ads
            }
        });
    }

    async checkSubscription(userId) {
        try {
            const db = window.firebase.firestore();
            const doc = await db.collection('users').doc(userId).get();

            if (!doc.exists) {
                this.showAds();
                return;
            }

            const data = doc.data();
            
            // --- CRITICAL DATE CHECK ---
            if (data.subscriptionEnd) {
                const endDate = new Date(data.subscriptionEnd);
                const now = new Date();

                // If End Date is in the future, they are premium
                if (endDate > now) {
                    console.log('User is Premium. Hiding Ads.');
                    this.hideAds();
                } else {
                    console.log('Subscription Expired. Showing Ads.');
                    this.showAds();
                }
            } else {
                // No subscription date found
                this.showAds();
            }

        } catch (error) {
            console.error('Error checking subscription:', error);
            this.showAds(); // Fail safe: Show ads on error
        }
    }

    showAds() {
        const container = document.getElementById(this.adContainerId);
        if (container) {
            container.innerHTML = ''; // Clear previous content
            
            // Create the Google Ad Script
            const script = document.createElement('script');
            script.async = true;
            script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6280599021277554";
            script.crossOrigin = "anonymous";
            
            // Append it to the container
            container.appendChild(script);
            console.log('Google Ads Injected.');
        }
    }

    hideAds() {
        const container = document.getElementById(this.adContainerId);
        if (container) {
            container.style.display = 'none'; // Completely hide the space
            container.innerHTML = ''; // Clean up
        }
    }
}

// Initialize immediately
const subChecker = new SubscriptionChecker();
document.addEventListener('DOMContentLoaded', () => subChecker.init());
