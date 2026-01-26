import axios from 'axios';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req, res) {
    // 1. CORS Headers (Essential for Vercel)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Handle Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    let db, auth;

    try {
        // 2. Safe Firebase Initialization (Inside the function to catch errors)
        if (!getApps().length) {
            if (!process.env.FIREBASE_PRIVATE_KEY) throw new Error("Missing FIREBASE_PRIVATE_KEY in Vercel");
            if (!process.env.FIREBASE_CLIENT_EMAIL) throw new Error("Missing FIREBASE_CLIENT_EMAIL in Vercel");
            if (!process.env.FIREBASE_PROJECT_ID) throw new Error("Missing FIREBASE_PROJECT_ID in Vercel");

            // Fix the key format safely
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey,
                }),
            });
        }
        
        const app = getApp();
        db = getFirestore(app);
        auth = getAuth(app);

    } catch (initError) {
        console.error("FIREBASE INIT ERROR:", initError);
        // Returns JSON error instead of crashing
        return res.status(500).json({ success: false, error: `Server Config Error: ${initError.message}` });
    }

    try {
        // 3. Verify User Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // 4. Validate Inputs
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });
        
        if (!process.env.PAYPACK_CLIENT_ID || !process.env.PAYPACK_CLIENT_SECRET) {
            throw new Error("Missing Paypack Credentials in Vercel Settings");
        }

        // --- STEP 5: AUTHENTICATE WITH PAYPACK (Required!) ---
        console.log("Authenticating with Paypack...");
        const authResponse = await axios.post(
            'https://payments.paypack.rw/api/auth/agents/authorize',
            {
                client_id: process.env.PAYPACK_CLIENT_ID,
                client_secret: process.env.PAYPACK_CLIENT_SECRET,
            }
        );

        const accessToken = authResponse.data.access; 
        console.log("Paypack Token Received.");

        // --- STEP 6: REQUEST PAYMENT ---
        console.log(`Requesting 1445 RWF from ${phoneNumber}...`);
        const paymentResponse = await axios.post(
            'https://payments.paypack.rw/api/transactions/cashin',
            {
                amount: 1445,
                number: phoneNumber,
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`, // Use the token we just got
                    'Content-Type': 'application/json',
                },
            }
        );

        const paypackData = paymentResponse.data;

        // 7. Save Transaction to Firebase
        await db.collection('transactions').doc(paypackData.ref).set({
            userId: userId,
            amount: 1445,
            phoneNumber: phoneNumber,
            status: 'pending',
            paypackRef: paypackData.ref,
            createdAt: new Date().toISOString(),
            subscriptionEnd: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
        });

        return res.status(200).json({
            success: true,
            message: 'Check your phone to confirm payment',
            ref: paypackData.ref
        });

    } catch (error) {
        console.error('RUNTIME ERROR:', error.response?.data || error.message);
        return res.status(500).json({ 
            success: false,
            error: error.response?.data?.message || error.message || "Internal Server Error" 
        });
    }
}
