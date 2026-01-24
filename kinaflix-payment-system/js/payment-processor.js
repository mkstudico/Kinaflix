// payment-processor.js
/**
 * KINAFLIX Payment Processor
 * Handles all payment-related operations
 */

class PaymentProcessor {
    constructor() {
        this.apiBaseUrl = '/api';
        this.isProcessing = false;
        this.paymentPollInterval = null;
    }

    /**
     * Initialize payment processor
     */
    init() {
        console.log('Payment Processor initialized');
        return this;
    }

    /**
     * Process mobile money payment
     * @param {string} phoneNumber - User's phone number (format: 07XXXXXXXX)
     * @param {string} userId - Firebase user ID
     * @returns {Promise<Object>} Payment result
     */
    async processPayment(phoneNumber, userId) {
        if (this.isProcessing) {
            throw new Error('Payment already in progress');
        }

        // Validate phone number
        if (!this.validatePhoneNumber(phoneNumber)) {
            throw new Error('Invalid phone number format. Use 07XXXXXXXX.');
        }

        this.isProcessing = true;

        try {
            // Get Firebase token
            const token = await this.getFirebaseToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            // Call payment API
            const response = await fetch(`${this.apiBaseUrl}/paypack-cashin`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phoneNumber: phoneNumber,
                    userId: userId
                })
            });

            const data = await response.json();

            // Handle response
            if (response.ok && data.success) {
                if (data.pending) {
                    return {
                        status: 'pending',
                        message: data.message || 'Payment pending confirmation',
                        transactionId: data.transactionId,
                        data: data
                    };
                } else {
                    return {
                        status: 'success',
                        message: data.message || 'Payment successful',
                        transactionId: data.transactionId,
                        subscriptionEnd: data.subscriptionEnd,
                        data: data
                    };
                }
            } else {
                throw new Error(data.error || 'Payment failed');
            }

        } catch (error) {
            console.error('Payment processing error:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Poll payment status
     * @param {string} transactionId - PayPack transaction ID
     * @param {Function} onSuccess - Callback on success
     * @param {Function} onTimeout - Callback on timeout
     * @param {number} timeoutMinutes - Timeout in minutes (default: 5)
     */
    pollPaymentStatus(transactionId, onSuccess, onTimeout, timeoutMinutes = 5) {
        let attempts = 0;
        const maxAttempts = (timeoutMinutes * 60) / 10; // Check every 10 seconds
        
        if (this.paymentPollInterval) {
            clearInterval(this.paymentPollInterval);
        }

        this.paymentPollInterval = setInterval(async () => {
            attempts++;
            
            if (attempts > maxAttempts) {
                clearInterval(this.paymentPollInterval);
                this.paymentPollInterval = null;
                if (onTimeout) onTimeout();
                return;
            }

            try {
                const status = await this.checkPaymentStatus();
                if (status === 'success') {
                    clearInterval(this.paymentPollInterval);
                    this.paymentPollInterval = null;
                    if (onSuccess) onSuccess();
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 10000); // Poll every 10 seconds
    }

    /**
     * Check payment status
     * @returns {Promise<string>} Payment status
     */
    async checkPaymentStatus() {
        try {
            const token = await this.getFirebaseToken();
            if (!token) return 'unknown';

            const response = await fetch(`${this.apiBaseUrl}/check-payment`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.adsFree ? 'success' : 'pending';
            }

            return 'unknown';
        } catch (error) {
            console.error('Error checking payment status:', error);
            return 'unknown';
        }
    }

    /**
     * Validate phone number
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} True if valid
     */
    validatePhoneNumber(phoneNumber) {
        const regex = /^07[0-9]{8}$/;
        return regex.test(phoneNumber);
    }

    /**
     * Get Firebase authentication token
     * @returns {Promise<string|null>} Firebase token or null
     */
    async getFirebaseToken() {
        if (!window.firebase || !window.firebase.auth) {
            console.error('Firebase not loaded');
            return null;
        }

        try {
            const user = window.firebase.auth().currentUser;
            if (!user) return null;
            
            const token = await user.getIdToken();
            return token;
        } catch (error) {
            console.error('Error getting Firebase token:', error);
            return null;
        }
    }

    /**
     * Format phone number for display
     * @param {string} phoneNumber - Raw phone number
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        
        const cleaned = phoneNumber.replace(/\D/g, '');
        if (cleaned.length === 10 && cleaned.startsWith('07')) {
            return `07${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
        }
        
        return phoneNumber;
    }

    /**
     * Handle payment error
     * @param {Error} error - Error object
     * @returns {string} User-friendly error message
     */
    getErrorMessage(error) {
        const message = error.message || 'Payment failed';
        
        // Map technical errors to user-friendly messages
        if (message.includes('unapproved') || message.includes('not approved')) {
            return 'Phone number not approved for mobile money. Please ensure your number is registered.';
        } else if (message.includes('insufficient') || message.includes('balance')) {
            return 'Insufficient balance. Please top up your mobile money account.';
        } else if (message.includes('network') || message.includes('timeout')) {
            return 'Network error. Please check your connection and try again.';
        } else if (message.includes('invalid') || message.includes('number')) {
            return 'Invalid phone number format. Please use 07XXXXXXXX.';
        }
        
        return message;
    }

    /**
     * Redirect to success page
     * @param {string} transactionId - Transaction ID
     */
    redirectToSuccess(transactionId) {
        window.location.href = `/payment-success.html?transaction_id=${transactionId}`;
    }

    /**
     * Redirect to failed page
     * @param {string} errorMessage - Error message
     */
    redirectToFailed(errorMessage) {
        const encodedError = encodeURIComponent(errorMessage);
        window.location.href = `/payment-failed.html?error=${encodedError}`;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.paymentPollInterval) {
            clearInterval(this.paymentPollInterval);
            this.paymentPollInterval = null;
        }
        this.isProcessing = false;
    }
}

// Create global instance
window.KinaflixPayment = new PaymentProcessor();

// Auto-initialize when loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.KinaflixPayment.init();
    });
} else {
    window.KinaflixPayment.init();
}
