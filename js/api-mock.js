// api-mock.js - For development/testing only
/**
 * Mock API endpoints for development
 * Replace with real backend in production
 */

class ApiMock {
    constructor() {
        this.pendingPayments = new Map();
        this.mockData = {
            users: new Map()
        };
    }

    /**
     * Mock payment endpoint
     */
    async mockPaypackCashin(request) {
        // Simulate API delay
        await this.delay(1000);
        
        const { phoneNumber, userId } = request;
        
        // Simulate different responses
        const random = Math.random();
        
        if (random < 0.7) {
            // 70% success rate
            const transactionId = `TRX${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
            const subscriptionEnd = new Date();
            subscriptionEnd.setDate(subscriptionEnd.getDate() + 21);
            
            // Store mock data
            this.mockData.users.set(userId, {
                adsFree: true,
                subscriptionEnd: subscriptionEnd,
                lastPayment: {
                    amount: 1000,
                    currency: 'RWF',
                    phoneNumber: phoneNumber,
                    transactionId: transactionId,
                    timestamp: new Date()
                }
            });
            
            return {
                success: true,
                message: 'Payment successful! Ads removed for 21 days.',
                transactionId: transactionId,
                subscriptionEnd: subscriptionEnd.toISOString()
            };
            
        } else if (random < 0.85) {
            // 15% pending
            const transactionId = `TRX${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
            this.pendingPayments.set(transactionId, { userId, phoneNumber });
            
            return {
                success: true,
                pending: true,
                message: 'Payment pending. Please confirm on your phone.',
                transactionId: transactionId
            };
            
        } else {
            // 15% failure
            const errors = [
                'Insufficient balance',
                'Phone number not approved',
                'Network error',
                'Transaction timeout'
            ];
            const error = errors[Math.floor(Math.random() * errors.length)];
            
            return {
                success: false,
                error: error
            };
        }
    }

    /**
     * Mock payment status check
     */
    async mockCheckPayment(userId) {
        await this.delay(500);
        
        const userData = this.mockData.users.get(userId);
        
        if (userData && userData.adsFree) {
            const now = new Date();
            const isActive = userData.subscriptionEnd > now;
            
            return {
                hasSubscription: isActive,
                adsFree: isActive,
                subscriptionActive: isActive,
                subscriptionEnd: userData.subscriptionEnd.toISOString(),
                daysRemaining: isActive ? 
                    Math.ceil((userData.subscriptionEnd - now) / (1000 * 60 * 60 * 24)) : 0,
                lastPayment: userData.lastPayment
            };
        }
        
        return {
            hasSubscription: false,
            adsFree: false,
            subscriptionActive: false
        };
    }

    /**
     * Simulate delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup mock API endpoints
     */
    setupMockEndpoints() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('Setting up mock API endpoints for development');
            
            // Override fetch for testing
            const originalFetch = window.fetch;
            
            window.fetch = async function(resource, options = {}) {
                const url = resource.toString();
                
                // Mock /api/paypack-cashin
                if (url.includes('/api/paypack-cashin')) {
                    const request = JSON.parse(options.body || '{}');
                    const response = await window.ApiMock.mockPaypackCashin(request);
                    
                    return new Response(JSON.stringify(response), {
                        status: response.success ? (response.pending ? 202 : 200) : 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                // Mock /api/check-payment
                if (url.includes('/api/check-payment')) {
                    const authHeader = options.headers?.Authorization;
                    const token = authHeader?.split('Bearer ')[1];
                    
                    // Extract userId from mock token (in real app, decode Firebase token)
                    const userId = token ? `user_${token.substring(0, 8)}` : null;
                    const response = await window.ApiMock.mockCheckPayment(userId);
                    
                    return new Response(JSON.stringify(response), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                // Use original fetch for other requests
                return originalFetch(resource, options);
            };
        }
    }
}

// Create global instance
window.ApiMock = new ApiMock();

// Auto-setup mock endpoints in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ApiMock.setupMockEndpoints();
    });
}
