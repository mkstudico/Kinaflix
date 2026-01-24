// /api/check-payment.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
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
    const decodedToken = await auth.verifyIdToken(firebaseToken);
    const userId = decodedToken.uid;

    // 2. Get user subscription status
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(200).json({
        success: true,
        hasSubscription: false,
        adsFree: false,
        subscriptionActive: false,
        message: 'No subscription found'
      });
    }

    const userData = userDoc.data();
    const now = Timestamp.now();
    
    // 3. Check subscription validity
    let adsFree = false;
    let subscriptionActive = false;
    let subscriptionEnd = null;
    let daysRemaining = 0;

    if (userData.adsFree === true && userData.subscriptionEnd) {
      subscriptionEnd = userData.subscriptionEnd.toDate();
      subscriptionActive = userData.subscriptionEnd > now;
      adsFree = subscriptionActive;
      
      if (subscriptionActive) {
        const remainingTime = subscriptionEnd - now.toDate();
        daysRemaining = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
      } else {
        // Subscription expired, update status
        await userRef.update({
          adsFree: false,
          updatedAt: now
        });
        
        // Log expiration
        await db.collection('subscription_logs').add({
          userId: userId,
          event: 'expired',
          timestamp: now
        });
      }
    }

    // 4. Check for pending payments
    const pendingQuery = await db.collection('pending_payments')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    
    const pendingPayments = [];
    pendingQuery.forEach(doc => {
      const data = doc.data();
      if (data.expiresAt && data.expiresAt > now) {
        pendingPayments.push({
          transactionId: doc.id,
          phoneNumber: data.phoneNumber,
          amount: data.amount,
          createdAt: data.createdAt.toDate().toISOString()
        });
      }
    });

    // 5. Return subscription status
    return res.status(200).json({
      success: true,
      hasSubscription: subscriptionActive,
      adsFree: adsFree,
      subscriptionActive: subscriptionActive,
      subscriptionEnd: subscriptionEnd ? subscriptionEnd.toISOString() : null,
      daysRemaining: daysRemaining,
      lastPayment: userData.lastPayment || null,
      pendingPayments: pendingPayments,
      userEmail: userData.email || decodedToken.email || ''
    });

  } catch (error) {
    console.error('Error checking payment:', error);
    return res.status(500).json({
      success: false,
      error: 'Error checking subscription status'
    });
  }
}
