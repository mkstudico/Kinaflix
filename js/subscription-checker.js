class SubscriptionChecker {
    constructor() {
        this.adContainerId = 'kinaflix-ad-container'; 
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
                this.showAds(); // Not logged in = Show Ads + Banner
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
            
            if (data.subscriptionEnd) {
                const endDate = new Date(data.subscriptionEnd);
                const now = new Date();

                // Check if subscription is still valid
                if (endDate > now) {
                    console.log('User is Premium. Hiding Ads.');
                    this.hideAds();
                } else {
                    console.log('Subscription Expired. Showing Ads.');
                    this.showAds();
                }
            } else {
                this.showAds();
            }

        } catch (error) {
            console.error('Error checking subscription:', error);
            this.showAds(); 
        }
    }

    showAds() {
        const container = document.getElementById(this.adContainerId);
        if (container) {
            container.style.display = 'block';
            container.innerHTML = ''; // Clear old stuff
            
            // 1. Create the Custom "Pay to Remove" Banner
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
            
            // 3. Add them to the page
            container.appendChild(banner);
            container.appendChild(script);
            console.log('Ads + Banner Injected.');
        }
    }

    hideAds() {
        const container = document.getElementById(this.adContainerId);
        if (container) {
            container.style.display = 'none'; // Hide everything (Banner + Ads)
            container.innerHTML = ''; 
        }
    }
}

// Initialize
const subChecker = new SubscriptionChecker();
document.addEventListener('DOMContentLoaded', () => subChecker.init());
