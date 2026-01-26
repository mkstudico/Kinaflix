import axios from 'axios';
// We import these, but we won't use them until INSIDE the function
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req, res) {
    // 1. Set CORS Headers (So your browser accepts the answer)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // 2. Handle Preflight (Browser checking if server is safe)
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    console.log("Starting Request..."); // Log to Vercel Console

    // 3. DEBUG: Check Variables (Don't reveal secrets, just check existence)
    if (!process.env.FIREBASE_PRIVATE_KEY) {
        console.error("CRITICAL: FIREBASE_PRIVATE_KEY is missing!");
        return res.status(500).json({ error: "Server Config Error: Private Key Missing" });
    }
    if (!process.env.PAYPACK_CLIENT_ID) {
        console.error("CRITICAL: PAYPACK_CLIENT_ID is missing!");
        return res.status(500).json({ error: "Server Config Error: Paypack ID Missing" });
    }

    let db, auth;

    try {
        // 4. Initialize Firebase SAFELY (Inside the function)
        // This prevents the "Unexpected token A" crash
        if (getApps().length === 0) {
            console.log("Initializing Firebase...");
            const rawKey = process.env.FIREBASE_PRIVATE_KEY;
            // Handle both escaped newlines (\\n) and real newlines (\n)
            const privateKey = rawKey.replace(/\\n/g, '\n');

            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey,
                }),
            });
            console.log("Firebase Initialized!");
        }
        
        const app = getApp();
        db = getFirestore(app);
        auth = getAuth(app);

    } catch (initError) {
        console.error("FIREBASE CRASH:", initError);
        return res.status(500).json({ 
            error: `Firebase Init Failed: ${initError.message}` 
        });
    }

    try {
        // 5. Check User Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        // Verify token
        const decodedToken = await auth.verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // 6. Get Data
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

        // 7. Paypack Authentication
        console.log("Logging into Paypack...");
        const authResponse = await axios.post(
            'https://payments.paypack.rw/api/auth/agents/authorize',
            {
                client_id: process.env.PAYPACK_CLIENT_ID,
                client_secret: process.env.PAYPACK_CLIENT_SECRET,
            }
        );

        const accessToken = authResponse.data.access; 
        console.log("Paypack Login Success.");

        // 8. Request Money
        console.log(`Asking ${phoneNumber} for payment...`);
        const paymentResponse = await axios.post(
            'https://payments.paypack.rw/api/transactions/cashin',
            {
                amount: 1445,
                number: phoneNumber,
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const paypackData = paymentResponse.data;

        // 9. Save to Database
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
        console.error('RUNTIME ERROR:', error.message);
        // Returns JSON so frontend doesn't break
        return res.status(500).json({ 
            error: error.response?.data?.message || error.message || "Unknown Server Error" 
        });
    }
}
