// js/payment-processor.js
class PaymentProcessor {
  constructor() {
    this.baseURL = window.location.origin;
    this.isProcessing = false;
    this.pollingInterval = null;
  }
  
  async processPayment(phoneNumber, amount = 1000, currency = 'RWF') {
    if (this.isProcessing) {
      throw new Error('A payment is already being processed.');
    }
    
    if (!auth.currentUser) {
      throw new Error('You must be logged in to make a payment.');
    }
    
    if (!phoneNumber || !phoneNumber.match(/^07\d{8}$/)) {
      throw new Error('Please enter a valid Rwandan phone number (07XXXXXXXX).');
    }
    
    this.isProcessing = true;
    
    try {
      const token = await auth.currentUser.getIdToken(true);
      
      const response = await fetch(`${this.baseURL}/api/paypack-cashin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          amount: amount,
          currency: currency,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Payment failed. Please try again.');
      }
      
      return data;
      
    } finally {
      this.isProcessing = false;
    }
  }
  
  async checkSubscriptionStatus() {
    try {
      if (!auth.currentUser) {
        return null;
      }
      
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch(`${this.baseURL}/api/check-payment`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to check subscription status.');
      }
      
      return await response.json();
      
    } catch (error) {
      console.error('Error checking subscription:', error);
      return null;
    }
  }
  
  async pollPaymentStatus(transactionId, maxAttempts = 30, interval = 2000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      this.pollingInterval = setInterval(async () => {
        attempts++;
        
        if (attempts > maxAttempts) {
          clearInterval(this.pollingInterval);
          reject(new Error('Payment confirmation timeout. Please check your phone and refresh the page.'));
          return;
        }
        
        try {
          const status = await this.checkSubscriptionStatus();
          
          if (status && status.subscriptionActive) {
            clearInterval(this.pollingInterval);
            resolve(status);
          } else if (status && status.hasSubscription && !status.subscriptionActive) {
            clearInterval(this.pollingInterval);
            reject(new Error('Payment was not confirmed. Please try again.'));
          }
        } catch (error) {
          // Continue polling on errors
          console.log('Polling attempt', attempts, 'failed:', error.message);
        }
      }, interval);
    });
  }
  
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  
  async verifyUserToken(idToken) {
    try {
      const response = await fetch(`${this.baseURL}/api/verify-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });
      
      return await response.json();
      
    } catch (error) {
      console.error('Token verification failed:', error);
      return { success: false, error: 'Verification failed' };
    }
  }
}

// Initialize global payment processor
window.paymentProcessor = new PaymentProcessor();
