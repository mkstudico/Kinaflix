import axios from 'axios';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Initialize Firebase Admin (Only once)
if (!getApps().length) {
    try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY 
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
            : undefined;

        if (!privateKey) throw new Error("FIREBASE_PRIVATE_KEY is missing in Vercel Settings");

        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            }),
        });
    } catch (e) {
        console.error("Firebase Init Error:", e);
    }
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
    // 2. Fix CORS (Allow your Vercel frontend to talk to this backend)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Handle "Preflight" check from browser
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 3. Security Check (Verify User is Logged In)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // 4. Validate Input
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // --- STEP 5: AUTHENTICATE WITH PAYPACK (This was missing!) ---
        // We must exchange Client ID/Secret for a temporary Access Token
        console.log("Getting Paypack Token...");
        const authResponse = await axios.post(
            'https://payments.paypack.rw/api/auth/agents/authorize',
            {
                client_id: process.env.PAYPACK_CLIENT_ID,
                client_secret: process.env.PAYPACK_CLIENT_SECRET,
            }
        );

        const accessToken = authResponse.data.access; 
        console.log("Paypack Token Received.");

        // --- STEP 6: REQUEST PAYMENT (CASHIN) ---
        console.log(`Requesting Payment for ${phoneNumber}...`);
        const paymentResponse = await axios.post(
            'https://payments.paypack.rw/api/transactions/cashin',
            {
                amount: 1445, // Fixed amount
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

        // 7. Save to Database
        await db.collection('transactions').doc(paypackData.ref).set({
            userId: userId,
            amount: 1445,
            phoneNumber: phoneNumber,
            status: 'pending', // Webhook will update this to 'successful' later
            paypackRef: paypackData.ref,
            createdAt: new Date().toISOString(),
            // Pre-calculate subscription end date (inactive until payment confirms)
            subscriptionEnd: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
        });

        // 8. Send Success Response to Frontend
        return res.status(200).json({
            success: true,
            message: 'Check your phone to confirm payment',
            ref: paypackData.ref
        });

    } catch (error) {
        console.error('SERVER ERROR:', error.response?.data || error.message);
        
        // Return a JSON error so your frontend doesn't crash with "Unexpected token A"
        return res.status(500).json({ 
            success: false,
            error: error.response?.data?.message || error.message || "Internal Server Error" 
        });
    }
}
