// /api/paypack-cashin.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK only once
let firebaseApp, db, auth;

try {
  if (!global.firebaseApp) {
    firebaseApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    global.firebaseApp = firebaseApp;
  } else {
    firebaseApp = global.firebaseApp;
  }
  
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
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
    // 1. Validate Firebase Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or invalid token'
      });
    }

    const firebaseToken = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(firebaseToken);
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email || '';

    // 2. Validate request body
    const { phoneNumber } = req.body;
    
    if (!phoneNumber || !/^07[0-9]{8}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number. Must be 10 digits starting with 07 (MTN/Airtel).'
      });
    }

    // 3. Check if user already has active subscription
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const now = Timestamp.now();
      
      // Check if subscription is still active
      if (userData.adsFree === true && userData.subscriptionEnd && userData.subscriptionEnd > now) {
        return res.status(400).json({
          success: false,
          error: 'You already have an active ad-free subscription.'
        });
      }
    }

    // 4. SECURITY: Get PayPack credentials from environment variables
    const PAYPACK_APP_ID = process.env.PAYPACK_APP_ID;
    const PAYPACK_APP_SECRET = process.env.PAYPACK_APP_SECRET;
    
    if (!PAYPACK_APP_ID || !PAYPACK_APP_SECRET) {
      console.error('PayPack credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'Payment service configuration error.'
      });
    }

    // 5. Authenticate with PayPack to get access token
    console.log('Authenticating with PayPack...');
    const authResponse = await fetch('https://payments.paypack.rw/api/auth/agents/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: PAYPACK_APP_ID,
        client_secret: PAYPACK_APP_SECRET
      })
    });

    if (!authResponse.ok) {
      console.error('PayPack auth failed:', await authResponse.text());
      throw new Error('PayPack authentication failed');
    }

    const authData = await authResponse.json();
    const accessToken = authData.access;
    console.log('PayPack authentication successful');

    // 6. Initiate PayPack Cash-In transaction
    console.log(`Initiating cash-in for ${phoneNumber}`);
    const cashInResponse = await fetch('https://payments.paypack.rw/api/transactions/cashin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 1000, // Fixed amount: 1000 RWF
        number: phoneNumber
      })
    });

    const paypackData = await cashInResponse.json();
    console.log('PayPack response:', paypackData);
    
    if (!cashInResponse.ok) {
      // Handle PayPack API errors
      let errorMessage = 'Payment failed';
      
      if (paypackData.detail) {
        errorMessage = paypackData.detail;
      } else if (paypackData.message) {
        errorMessage = paypackData.message;
      }
      
      // Check for specific error types
      const errorLower = errorMessage.toLowerCase();
      if (errorLower.includes('unapproved') || 
          errorLower.includes('not approved') ||
          errorLower.includes('not whitelisted')) {
        errorMessage = 'Phone number not approved for PayPack. Please ensure your number is registered with PayPack.';
      } else if (errorLower.includes('insufficient') || 
                 errorLower.includes('balance')) {
        errorMessage = 'Insufficient balance. Please top up your mobile money account.';
      } else if (errorLower.includes('timeout') || 
                 errorLower.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (errorLower.includes('invalid') || 
                 errorLower.includes('number')) {
        errorMessage = 'Invalid phone number format. Please use 07XXXXXXXX format.';
      }
      
      return res.status(400).json({
        success: false,
        error: errorMessage
      });
    }

    // 7. Handle PayPack response states
    const transactionId = paypackData.ref;
    const transactionStatus = paypackData.status?.toLowerCase() || 'pending';
    
    if (transactionStatus === 'successful' || transactionStatus === 'success') {
      // 8. Payment successful - update Firestore
      const now = Timestamp.now();
      const subscriptionEnd = new Date(now.toDate());
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 21); // Add 21 days
      
      const userData = {
        email: userEmail,
        adsFree: true,
        subscriptionStart: now,
        subscriptionEnd: Timestamp.fromDate(subscriptionEnd),
        lastPayment: {
          amount: 1000,
          currency: 'RWF',
          phoneNumber: phoneNumber,
          transactionId: transactionId,
          timestamp: now,
          status: 'success'
        },
        updatedAt: now
      };
      
      await userRef.set(userData, { merge: true });
      
      // 9. Log payment success
      await db.collection('payment_logs').add({
        userId: userId,
        transactionId: transactionId,
        amount: 1000,
        currency: 'RWF',
        phoneNumber: phoneNumber,
        status: 'success',
        timestamp: now
      });
      
      // 10. Return success response
      return res.status(200).json({
        success: true,
        message: 'Payment successful! Ads are now removed for 21 days.',
        transactionId: transactionId,
        subscriptionEnd: subscriptionEnd.toISOString(),
        adsFree: true
      });
      
    } else if (transactionStatus === 'pending') {
      // 11. Payment is pending - user needs to confirm
      // Store pending transaction
      await db.collection('pending_payments').doc(transactionId).set({
        userId: userId,
        phoneNumber: phoneNumber,
        amount: 1000,
        status: 'pending',
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // Expire in 10 minutes
      });
      
      return res.status(202).json({
        success: true,
        pending: true,
        message: 'Payment pending. Please confirm the transaction on your phone.',
        transactionId: transactionId,
        instructions: 'You will receive a payment request on your phone. Please enter your PIN to confirm.'
      });
      
    } else {
      // 12. Payment failed or unknown status
      await db.collection('payment_logs').add({
        userId: userId,
        transactionId: transactionId,
        amount: 1000,
        currency: 'RWF',
        phoneNumber: phoneNumber,
        status: 'failed',
        paypackStatus: transactionStatus,
        timestamp: Timestamp.now()
      });
      
      return res.status(400).json({
        success: false,
        error: 'Payment failed. Please try again.',
        transactionStatus: transactionStatus
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    
    // Don't expose internal error details to client
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later.'
    });
  }
}
