// js/subscription-manager.js
class SubscriptionManager {
  constructor() {
    this.subscriptionData = null;
    this.checkInterval = null;
  }
  
  async init() {
    await this.loadSubscriptionStatus();
    
    // Check subscription status every 5 minutes
    this.checkInterval = setInterval(() => {
      this.loadSubscriptionStatus();
    }, 5 * 60 * 1000);
    
    return this.subscriptionData;
  }
  
  async loadSubscriptionStatus() {
    try {
      if (!auth.currentUser) {
        this.subscriptionData = null;
        return;
      }
      
      const data = await paymentProcessor.checkSubscriptionStatus();
      
      if (data && data.success) {
        this.subscriptionData = data;
        
        // Save to localStorage for quick access
        localStorage.setItem('kinaflix_subscription', JSON.stringify(data));
        
        // Update UI if updateUI function exists
        if (window.updateUI) {
          window.updateUI();
        }
        
        // Dispatch custom event
        this.dispatchSubscriptionUpdate(data);
      }
    } catch (error) {
      console.error('Failed to load subscription:', error);
    }
  }
  
  dispatchSubscriptionUpdate(data) {
    const event = new CustomEvent('subscription-update', {
      detail: data,
    });
    window.dispatchEvent(event);
  }
  
  isAdFree() {
    return this.subscriptionData?.adsFree || false;
  }
  
  getDaysRemaining() {
    return this.subscriptionData?.daysRemaining || 0;
  }
  
  getSubscriptionEnd() {
    return this.subscriptionData?.subscriptionEnd || null;
  }
  
  async refresh() {
    await this.loadSubscriptionStatus();
  }
  
  clearCache() {
    localStorage.removeItem('kinaflix_subscription');
    this.subscriptionData = null;
  }
  
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

// Initialize global subscription manager
window.subscriptionManager = new SubscriptionManager();

// Load subscription status when auth state changes
auth.onAuthStateChanged((user) => {
  if (user) {
    subscriptionManager.init();
  } else {
    subscriptionManager.clearCache();
  }
});
