// 1. USE STANDARD NODE.JS SYNTAX (CommonJS)
const axios = require('axios');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase safely
if (!getApps().length) {
  // Check if keys exist to prevent silent crashes
  if (process.env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Handle Vercel newlines correctly
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    console.error("FIREBASE_PRIVATE_KEY is missing!");
  }
}

const db = getFirestore();
const auth = getAuth();

// 2. USE 'module.exports' INSTEAD OF 'export default'
module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }
  
  try {
    // 3. VERIFY FIREBASE TOKEN
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Valid Firebase token required.' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      console.error("Token verification failed:", error);
      return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
    
    const userId = decodedToken.uid;
    const { phoneNumber, amount = 1445 } = req.body; // Default price 1445 RWF
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Valid phone number required' });
    }

    // 4. CHECK EXISTING SUBSCRIPTION (Keep your logic)
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.subscriptionEnd) {
        const subscriptionEnd = new Date(userData.subscriptionEnd);
        if (subscriptionEnd > new Date()) {
          return res.status(400).json({ success: false, error: 'You already have an active subscription.' });
        }
      }
    }
    
    // 5. GET PAYPACK ACCESS TOKEN (This was missing!)
    console.log("Getting PayPack Access Token...");
    const authResponse = await axios.post(
      'https://payments.paypack.rw/api/auth/agents/authorize',
      {
        client_id: process.env.PAYPACK_CLIENT_ID,
        client_secret: process.env.PAYPACK_CLIENT_SECRET,
      }
    );
    const accessToken = authResponse.data.access;

    // 6. REQUEST PAYMENT
    console.log('Calling PayPack API for:', phoneNumber, 'Amount:', amount);
    const paypackResponse = await axios.post(
      'https://payments.paypack.rw/api/transactions/cashin',
      {
        amount: parseInt(amount),
        number: phoneNumber,
        environment: process.env.PAYPACK_ENVIRONMENT || 'production',
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`, // Use the TOKEN, not the secret
          'Content-Type': 'application/json',
          'Idempotency-Key': `${userId}_${Date.now()}`,
        },
        timeout: 30000,
      }
    );
    
    console.log('PayPack Response:', paypackResponse.data);
    
    // 7. SAVE TRANSACTION & RETURN RESULT
    const transactionId = paypackResponse.data.ref;
    // Note: Status is usually 'pending' immediately after request
    const status = paypackResponse.data.status || 'pending'; 
    
    // Save transaction
    await db.collection('transactions').doc(transactionId).set({
      userId: userId,
      phoneNumber: phoneNumber,
      amount: parseInt(amount),
      transactionId: transactionId,
      status: status,
      provider: 'paypack',
      createdAt: new Date().toISOString(),
      // We set subscriptionEnd, but user stays 'inactive' until webhook confirms success
      subscriptionEnd: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Payment initiated. Check your phone.',
      transactionId: transactionId,
      status: status
    });

  } catch (error) {
    console.error('SERVER ERROR:', error.response?.data || error.message);
    
    // Return a clean JSON error so the frontend doesn't crash
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Payment processing failed',
    });
  }
};
