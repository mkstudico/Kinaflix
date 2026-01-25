// /api/check-payment.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.',
    });
  }
  
  try {
    // Verify Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Valid Firebase token required.',
      });
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token.',
      });
    }
    
    const userId = decodedToken.uid;
    
    // Get user data from Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(200).json({
        success: true,
        hasSubscription: false,
        adsFree: false,
        subscriptionActive: false,
        message: 'No subscription found.',
      });
    }
    
    const userData = userDoc.data();
    
    // Check subscription status
    if (userData.subscriptionEnd) {
      const subscriptionEnd = new Date(userData.subscriptionEnd);
      const now = new Date();
      const isActive = subscriptionEnd > now;
      const daysRemaining = isActive 
        ? Math.ceil((subscriptionEnd - now) / (1000 * 60 * 60 * 24))
        : 0;
      
      // If subscription expired, update adsFree status
      if (!isActive && userData.adsFree) {
        await userRef.update({
          adsFree: false,
          updatedAt: new Date().toISOString(),
        });
      }
      
      return res.status(200).json({
        success: true,
        hasSubscription: true,
        adsFree: isActive,
        subscriptionActive: isActive,
        subscriptionEnd: userData.subscriptionEnd,
        daysRemaining: daysRemaining,
        lastPayment: userData.lastPayment || null,
        phoneNumber: userData.phoneNumber || null,
      });
    }
    
    // No subscription found
    return res.status(200).json({
      success: true,
      hasSubscription: false,
      adsFree: false,
      subscriptionActive: false,
      message: 'No active subscription found.',
    });
    
  } catch (error) {
    console.error('Check payment error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
