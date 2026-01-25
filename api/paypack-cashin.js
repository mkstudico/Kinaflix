// /api/paypack-cashin.js
import axios from 'axios';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase (Standard setup)
if (!getApps().length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Fix private key formatting for Vercel
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  };
  
  if (serviceAccount.privateKey) {
     initializeApp({ credential: cert(serviceAccount) });
  }
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 1. Get the User ID from the request header (Security check)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const { phoneNumber } = req.body;
    
    // Hardcoded amount as requested: 1 USD approx 1445 RWF
    const amount = 1445; 

    // 2. Authenticate with Paypack to get an Access Token
    // We must do this before requesting money!
    const authResponse = await axios.post(
        'https://payments.paypack.rw/api/auth/agents/authorize',
        {
            client_id: process.env.PAYPACK_CLIENT_ID,
            client_secret: process.env.PAYPACK_CLIENT_SECRET,
        }
    );

    const accessToken = authResponse.data.access;

    // 3. Initiate the Payment (Cashin)
    const paymentResponse = await axios.post(
        'https://payments.paypack.rw/api/transactions/cashin',
        {
            amount: amount,
            number: phoneNumber,
        },
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        }
    );

    // 4. Save the "Pending" transaction to Firebase
    // The Webhook will update this to "Successful" later
    await db.collection('transactions').doc(paymentResponse.data.ref).set({
        userId: userId,
        phoneNumber: phoneNumber,
        amount: amount,
        transactionId: paymentResponse.data.ref,
        status: 'pending',
        createdAt: new Date().toISOString(),
        subscriptionEnd: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString() // 3 weeks
    });

    return res.status(200).json({ 
        success: true, 
        message: 'Check your phone to approve the payment.',
        ref: paymentResponse.data.ref
    });

  } catch (error) {
    console.error('Payment Error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Payment failed to start. Check phone number.' });
  }
}
