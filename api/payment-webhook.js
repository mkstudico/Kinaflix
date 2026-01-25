// /api/payment-webhook.js
import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
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

export default async function handler(req, res) {
  // Verify webhook signature
  const signature = req.headers['x-paypack-signature'];
  const payload = JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', process.env.PAYPACK_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid signature' 
    });
  }
  
  const event = req.body;
  console.log('Received PayPack webhook:', event);
  
  try {
    switch (event.event) {
      case 'transaction.successful':
        await handleSuccessfulTransaction(event.data);
        break;
        
      case 'transaction.failed':
        await handleFailedTransaction(event.data);
        break;
        
      case 'transaction.canceled':
        await handleCanceledTransaction(event.data);
        break;
        
      default:
        console.log('Unhandled webhook event:', event.event);
    }
    
    return res.status(200).json({ 
      success: true, 
      received: true 
    });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Processing failed' 
    });
  }
}

async function handleSuccessfulTransaction(transaction) {
  console.log('Processing successful transaction:', transaction.ref);
  
  try {
    // Find transaction in Firestore
    const transactionsRef = db.collection('transactions');
    const query = transactionsRef.where('transactionId', '==', transaction.ref);
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      console.log('Transaction not found in database:', transaction.ref);
      return;
    }
    
    const transactionDoc = snapshot.docs[0];
    const transactionData = transactionDoc.data();
    
    // Update transaction status
    await transactionDoc.ref.update({
      status: 'successful',
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerResponse: transaction,
    });
    
    // Calculate subscription end date (21 days from now)
    const subscriptionEnd = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    
    // Update user's subscription
    const userRef = db.collection('users').doc(transactionData.userId);
    
    await userRef.update({
      subscriptionEnd: subscriptionEnd.toISOString(),
      adsFree: true,
      lastPayment: {
        amount: transactionData.amount,
        currency: transactionData.currency || 'RWF',
        transactionId: transaction.ref,
        timestamp: new Date().toISOString(),
        phoneNumber: transactionData.phoneNumber,
        status: 'successful',
      },
      updatedAt: new Date().toISOString(),
    });
    
    console.log(`Updated subscription for user: ${transactionData.userId}`);
    
  } catch (error) {
    console.error('Error handling successful transaction:', error);
    throw error;
  }
}

async function handleFailedTransaction(transaction) {
  console.log('Processing failed transaction:', transaction.ref);
  
  try {
    // Find transaction in Firestore
    const transactionsRef = db.collection('transactions');
    const query = transactionsRef.where('transactionId', '==', transaction.ref);
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      console.log('Transaction not found in database:', transaction.ref);
      return;
    }
    
    const transactionDoc = snapshot.docs[0];
    
    // Update transaction status
    await transactionDoc.ref.update({
      status: 'failed',
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failureReason: transaction.reason || 'Unknown',
      providerResponse: transaction,
    });
    
    console.log(`Marked transaction as failed: ${transaction.ref}`);
    
  } catch (error) {
    console.error('Error handling failed transaction:', error);
    throw error;
  }
}

async function handleCanceledTransaction(transaction) {
  console.log('Processing canceled transaction:', transaction.ref);
  
  try {
    // Find transaction in Firestore
    const transactionsRef = db.collection('transactions');
    const query = transactionsRef.where('transactionId', '==', transaction.ref);
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      console.log('Transaction not found in database:', transaction.ref);
      return;
    }
    
    const transactionDoc = snapshot.docs[0];
    
    // Update transaction status
    await transactionDoc.ref.update({
      status: 'canceled',
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      providerResponse: transaction,
    });
    
    console.log(`Marked transaction as canceled: ${transaction.ref}`);
    
  } catch (error) {
    console.error('Error handling canceled transaction:', error);
    throw error;
  }
}
