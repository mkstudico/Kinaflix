// /api/paypack-cashin.js
import axios from 'axios';
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
      error: 'Method not allowed. Use POST.',
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
    
    // Validate request body
    const { phoneNumber, amount = 1000, currency = 'RWF' } = req.body;
    
    if (!phoneNumber || !phoneNumber.match(/^07\d{8}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Valid Rwandan phone number required (07XXXXXXXX)',
      });
    }
    
    // Check if user already has active subscription
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.subscriptionEnd) {
        const subscriptionEnd = new Date(userData.subscriptionEnd);
        const now = new Date();
        if (subscriptionEnd > now) {
          return res.status(400).json({
            success: false,
            error: 'You already have an active subscription.',
            subscriptionEnd: userData.subscriptionEnd,
          });
        }
      }
    }
    
    // ========== REAL PAYPACK API CALL ==========
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
          'Authorization': `Bearer ${process.env.PAYPACK_CLIENT_SECRET}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${userId}_${Date.now()}`,
        },
        timeout: 30000,
      }
    );
    
    console.log('PayPack Response:', paypackResponse.data);
    
    if (paypackResponse.data.success) {
      const transactionId = paypackResponse.data.ref;
      const status = paypackResponse.data.status || 'pending';
      
      // Calculate subscription end date (21 days from now)
      const subscriptionEnd = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
      
      // Save transaction to Firestore
      const transactionRef = db.collection('transactions').doc(transactionId);
      await transactionRef.set({
        userId: userId,
        phoneNumber: phoneNumber,
        amount: parseInt(amount),
        currency: currency,
        transactionId: transactionId,
        status: status,
        provider: 'paypack',
        subscriptionEnd: subscriptionEnd.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerResponse: paypackResponse.data,
      });
      
      // Create/Update user document
      await userRef.set({
        email: decodedToken.email || '',
        phoneNumber: phoneNumber,
        subscriptionEnd: status === 'successful' ? subscriptionEnd.toISOString() : null,
        adsFree: status === 'successful',
        lastPayment: {
          amount: parseInt(amount),
          currency: currency,
          transactionId: transactionId,
          timestamp: new Date().toISOString(),
          phoneNumber: phoneNumber,
          status: status,
        },
        updatedAt: new Date().toISOString(),
        ...(userDoc.exists ? {} : { createdAt: new Date().toISOString() }),
      }, { merge: true });
      
      return res.status(200).json({
        success: true,
        message: status === 'successful' 
          ? 'Payment successful! Ads removed for 21 days.' 
          : 'Payment initiated. Please check your phone.',
        transactionId: transactionId,
        status: status,
        subscriptionEnd: status === 'successful' ? subscriptionEnd.toISOString() : null,
        adsFree: status === 'successful',
        requiresPIN: true,
        instructions: 'Please check your phone and enter your PIN to complete the transaction.',
      });
      
    } else {
      return res.status(400).json({
        success: false,
        error: paypackResponse.data.message || 'Payment initiation failed',
      });
    }
    
  } catch (error) {
    console.error('PayPack API Error:', error.response?.data || error.message);
    
    let errorMessage = 'Payment processing failed';
    let statusCode = 500;
    
    if (error.response) {
      statusCode = error.response.status;
      const paypackError = error.response.data;
      
      switch(paypackError.message) {
        case 'Insufficient balance':
          errorMessage = 'Insufficient mobile money balance. Please top up and try again.';
          break;
        case 'Invalid number':
          errorMessage = 'Invalid phone number. Please check and try again.';
          break;
        case 'Transaction limit exceeded':
          errorMessage = 'Daily transaction limit reached. Try again tomorrow.';
          break;
        case 'Network error':
          errorMessage = 'Mobile money network error. Please try again in a few minutes.';
          break;
        case 'User canceled':
          errorMessage = 'Payment canceled by user.';
          break;
        case 'Timeout':
          errorMessage = 'Payment request timed out. Please try again.';
          break;
        default:
          errorMessage = paypackError.message || 'Payment failed. Please try again.';
      }
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Payment service timeout. Please try again.';
    }
    
    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
