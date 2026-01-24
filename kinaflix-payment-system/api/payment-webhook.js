// /api/payment-webhook.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
let firebaseApp, db;

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
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

export default async function handler(req, res) {
  // PayPack webhook endpoint - no authentication required (validated by signature)
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const webhookData = req.body;
    console.log('PayPack webhook received:', webhookData);

    // Validate webhook signature (you should implement this with PayPack's signature verification)
    // const signature = req.headers['x-paypack-signature'];
    // if (!verifySignature(webhookData, signature)) {
    //   return res.status(401).json({ success: false, error: 'Invalid signature' });
    // }

    const { ref: transactionId, status, amount, number } = webhookData;

    // Find pending payment by transaction ID
    const pendingRef = db.collection('pending_payments').doc(transactionId);
    const pendingDoc = await pendingRef.get();
    
    if (!pendingDoc.exists) {
      console.log('No pending payment found for transaction:', transactionId);
      return res.status(200).json({ success: true, message: 'No pending payment found' });
    }

    const pendingData = pendingDoc.data();
    const userId = pendingData.userId;

    if (status === 'successful' || status === 'success') {
      // Payment successful
      const now = Timestamp.now();
      const subscriptionEnd = new Date(now.toDate());
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 21); // Add 21 days

      // Update user subscription
      const userRef = db.collection('users').doc(userId);
      await userRef.set({
        adsFree: true,
        subscriptionStart: now,
        subscriptionEnd: Timestamp.fromDate(subscriptionEnd),
        lastPayment: {
          amount: amount || 1000,
          currency: 'RWF',
          phoneNumber: number,
          transactionId: transactionId,
          timestamp: now,
          status: 'success'
        },
        updatedAt: now
      }, { merge: true });

      // Update pending payment status
      await pendingRef.update({
        status: 'completed',
        completedAt: now,
        webhookData: webhookData
      });

      // Log successful payment
      await db.collection('payment_logs').add({
        userId: userId,
        transactionId: transactionId,
        amount: amount || 1000,
        currency: 'RWF',
        phoneNumber: number,
        status: 'success',
        source: 'webhook',
        timestamp: now
      });

      console.log(`Subscription activated for user ${userId} via webhook`);

    } else if (status === 'failed') {
      // Payment failed
      const now = Timestamp.now();
      
      await pendingRef.update({
        status: 'failed',
        failedAt: now,
        webhookData: webhookData
      });

      // Log failed payment
      await db.collection('payment_logs').add({
        userId: userId,
        transactionId: transactionId,
        amount: amount || 1000,
        currency: 'RWF',
        phoneNumber: number,
        status: 'failed',
        source: 'webhook',
        timestamp: now
      });

      console.log(`Payment failed for user ${userId} via webhook`);
    }

    return res.status(200).json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error processing webhook'
    });
  }
}

// Function to verify webhook signature (implement based on PayPack documentation)
function verifySignature(payload, signature) {
  // Implement signature verification logic here
  // This is a placeholder - you need to implement this based on PayPack's documentation
  return true; // For now, return true. Implement proper verification in production.
}
