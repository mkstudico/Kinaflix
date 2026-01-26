// 1. Use 'require' (CommonJS) to match your package.json configuration
const axios = require('axios');
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

module.exports = async function handler(req, res) {
    // 2. CORS Headers - Critical for Vercel
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Handle Preflight requests
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    console.log("Starting Paypack Request...");

    // 3. Safe Firebase Initialization
    let db, auth;
    try {
        if (getApps().length === 0) {
            // Check keys before crashing
            if (!process.env.FIREBASE_PRIVATE_KEY) throw new Error("Missing FIREBASE_PRIVATE_KEY");
            if (!process.env.FIREBASE_CLIENT_EMAIL) throw new Error("Missing FIREBASE_CLIENT_EMAIL");
            if (!process.env.FIREBASE_PROJECT_ID) throw new Error("Missing FIREBASE_PROJECT_ID");

            // Fix the key format (handles \n from Vercel)
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

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
        console.error("FIREBASE INIT ERROR:", initError);
        return res.status(500).json({ success: false, error: `Server Config Error: ${initError.message}` });
    }

    try {
        // 4. Verify User is Logged In
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // 5. Validate Input
        const { phoneNumber } = req.body;
        // Accept user provided amount or default to 1445
        const amount = req.body.amount || 1445; 

        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });
        
        if (!process.env.PAYPACK_CLIENT_ID || !process.env.PAYPACK_CLIENT_SECRET) {
            throw new Error("Missing Paypack Credentials in Vercel Settings");
        }

        // --- STEP 6: AUTHENTICATE WITH PAYPACK (The Missing Link) ---
        console.log("Authenticating with Paypack...");
        const authResponse = await axios.post(
            'https://payments.paypack.rw/api/auth/agents/authorize',
            {
                client_id: process.env.PAYPACK_CLIENT_ID,
                client_secret: process.env.PAYPACK_CLIENT_SECRET,
            }
        );

        const accessToken = authResponse.data.access; // Get the REAL token
        console.log("Paypack Token Received.");

        // --- STEP 7: REQUEST PAYMENT ---
        console.log(`Requesting ${amount} RWF from ${phoneNumber}...`);
        const paymentResponse = await axios.post(
            'https://payments.paypack.rw/api/transactions/cashin',
            {
                amount: amount,
                number: phoneNumber,
                environment: 'production' // or 'development' if testing
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`, // Use the Access Token
                    'Content-Type': 'application/json',
                },
            }
        );

        const paypackData = paymentResponse.data;

        // 8. Save Transaction to Firebase
        await db.collection('transactions').doc(paypackData.ref).set({
            userId: userId,
            amount: amount,
            phoneNumber: phoneNumber,
            status: 'pending',
            paypackRef: paypackData.ref,
            createdAt: new Date().toISOString(),
            // 21 days subscription
            subscriptionEnd: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
        });

        return res.status(200).json({
            success: true,
            message: 'Check your phone to confirm payment',
            ref: paypackData.ref
        });

    } catch (error) {
        console.error('RUNTIME ERROR:', error.response?.data || error.message);
        // Return JSON so the frontend doesn't crash with "Unexpected token A"
        return res.status(500).json({ 
            success: false,
            error: error.response?.data?.message || error.message || "Internal Server Error" 
        });
    }
};
