// /api/paypack-cashin.js - Simple mock for testing
export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }
    
    try {
        // Get the authorization header
        const authHeader = req.headers.authorization;
        
        // Mock successful payment response
        return res.status(200).json({
            success: true,
            message: 'Payment processed successfully (MOCK MODE)',
            transactionId: 'MOCK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            subscriptionEnd: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
            adsFree: true,
            note: 'This is a mock response. Connect to real PayPack API for production.'
        });
        
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
}
