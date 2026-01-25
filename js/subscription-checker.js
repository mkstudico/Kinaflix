// subscription-checker.js
/**
 * KINAFLIX Subscription Checker
 * Manages subscription status and ad display
 */

class SubscriptionChecker {
    constructor() {
        this.checkInterval = null;
        this.currentUser = null;
        this.subscriptionData = null;
        this.adsEnabled = true;
    }

    /**
     * Initialize subscription checker
     */
    async init() {
        console.log('Subscription Checker initialized');
        
        // Listen for auth state changes
        this.setupAuthListener();
        
        // Initial check
        await this.checkSubscriptionStatus();
        
        return this;
    }

    /**
     * Setup Firebase auth listener
     */
    setupAuthListener() {
        if (!window.firebase || !window.firebase.auth) {
            console.error('Firebase not loaded');
            return;
        }

        window.firebase.auth().onAuthStateChanged(async (user) => {
            this.currentUser = user;
            await this.checkSubscriptionStatus();
        });
    }

    /**
     * Check user's subscription status
     */
    async checkSubscriptionStatus() {
        try {
            if (!this.currentUser) {
                // No user logged in - show ads
                this.subscriptionData = null;
                this.adsEnabled = true;
                this.updateAdsDisplay();
                return;
            }

            // Get subscription data from Firestore
            const subscription = await this.fetchSubscriptionData(this.currentUser.uid);
            
            if (subscription && subscription.active) {
                // Active subscription
                this.subscriptionData = subscription;
                this.adsEnabled = false;
                console.log('Active subscription found, ads disabled');
            } else {
                // No active subscription
                this.subscriptionData = subscription;
                this.adsEnabled = true;
                console.log('No active subscription, ads enabled');
            }
            
            this.updateAdsDisplay();
            
        } catch (error) {
            console.error('Error checking subscription:', error);
            // On error, default to showing ads
            this.adsEnabled = true;
            this.updateAdsDisplay();
        }
    }

    /**
     * Fetch subscription data from Firestore
     */
    async fetchSubscriptionData(userId) {
        try {
            if (!window.firebase || !window.firebase.firestore) {
                console.error('Firestore not loaded');
                return null;
            }

            const db = window.firebase.firestore();
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) return null;
            
            const userData = userDoc.data();
            const now = new Date();
            
            if (userData.adsFree && userData.subscriptionEnd) {
                const expiryDate = userData.subscriptionEnd.toDate();
                const isActive = expiryDate > now;
                const daysRemaining = isActive ? 
                    Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)) : 0;
                
                return {
                    active: isActive,
                    expiryDate: expiryDate,
                    daysRemaining: daysRemaining,
                    lastPayment: userData.lastPayment
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error fetching subscription data:', error);
            return null;
        }
    }

    /**
     * Update ads display based on subscription status
     */
    updateAdsDisplay() {
        const adContainers = document.querySelectorAll('.ad-container, .ad-slot');
        
        adContainers.forEach(container => {
            if (this.adsEnabled) {
                this.showAds(container);
            } else {
                this.hideAds(container);
            }
        });
        
        // Update subscription badge if exists
        this.updateSubscriptionBadge();
        
        // Dispatch event for other components
        this.dispatchAdsChangeEvent();
    }

    /**
     * Show ads in container
     */
    showAds(container) {
        if (container.classList.contains('ad-container')) {
            // Show Google AdSense
            container.innerHTML = `
                <div class="ad-content">
                    <!-- Google AdSense will auto-fill -->
                    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6280599021277554" crossorigin="anonymous"></script>
                    <ins class="adsbygoogle"
                         style="display:block"
                         data-ad-client="ca-pub-6280599021277554"
                         data-ad-slot="${this.getAdSlot(container)}"
                         data-ad-format="auto"
                         data-full-width-responsive="true">
                    </ins>
                    <script>
                        (adsbygoogle = window.adsbygoogle || []).push({});
                    </script>
                </div>
            `;
        }
    }

    /**
     * Hide ads for subscribed users
     */
    hideAds(container) {
        container.innerHTML = `
            <div class="ad-free-message">
                <i class="fas fa-crown"></i>
                <span>Enjoying Ad-Free Streaming</span>
            </div>
        `;
    }

    /**
     * Get appropriate ad slot for container
     */
    getAdSlot(container) {
        const id = container.id;
        
        // Map container IDs to ad slots
        const slotMap = {
            'ad-top': '1234567890',
            'ad-middle': '1234567891',
            'ad-bottom': '1234567892',
            'ad-sidebar': '1234567893'
        };
        
        return slotMap[id] || '1234567890';
    }

    /**
     * Update subscription status badge
     */
    updateSubscriptionBadge() {
        const badge = document.getElementById('subscription-badge');
        if (!badge) return;
        
        if (this.subscriptionData && this.subscriptionData.active) {
            badge.innerHTML = `
                <i class="fas fa-crown"></i>
                <span>Ad-Free (${this.subscriptionData.daysRemaining}d)</span>
            `;
            badge.className = 'subscription-badge active';
            badge.title = `Valid until ${this.subscriptionData.expiryDate.toLocaleDateString()}`;
        } else {
            badge.innerHTML = `
                <i class="fas fa-ad"></i>
                <span>Remove Ads</span>
            `;
            badge.className = 'subscription-badge inactive';
            badge.title = 'Click to remove ads';
            badge.onclick = () => window.location.href = '/subscribe';
        }
    }

    /**
     * Dispatch ads change event
     */
    dispatchAdsChangeEvent() {
        const event = new CustomEvent('kinaflix:adsChange', {
            detail: {
                adsEnabled: this.adsEnabled,
                subscriptionData: this.subscriptionData
            }
        });
        window.dispatchEvent(event);
    }

    /**
     * Start periodic checking
     * @param {number} intervalMinutes - Check interval in minutes
     */
    startPeriodicChecking(intervalMinutes = 5) {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(async () => {
            await this.checkSubscriptionStatus();
        }, intervalMinutes * 60 * 1000);
    }

    /**
     * Stop periodic checking
     */
    stopPeriodicChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Check if ads should be shown
     * @returns {boolean} True if ads should be shown
     */
    shouldShowAds() {
        return this.adsEnabled;
    }

    /**
     * Get subscription info
     * @returns {Object|null} Subscription data
     */
    getSubscriptionInfo() {
        return this.subscriptionData;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.stopPeriodicChecking();
    }
}

// Create global instance
window.KinaflixSubscription = new SubscriptionChecker();

// Auto-initialize when loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.KinaflixSubscription.init();
        // Start checking every 5 minutes
        window.KinaflixSubscription.startPeriodicChecking(5);
    });
} else {
    window.KinaflixSubscription.init();
    window.KinaflixSubscription.startPeriodicChecking(5);
}
