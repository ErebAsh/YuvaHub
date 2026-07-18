import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

let isFirebaseInitialized = false;

// Initialize Firebase Admin (with mock/fallback if credentials aren't present)
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    isFirebaseInitialized = true;
    console.log("[Auth] Firebase Admin initialized with provided service account.");
  } else if (process.env.FIREBASE_PROJECT_ID) {
     admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
     });
     isFirebaseInitialized = true;
     console.log("[Auth] Firebase Admin initialized with Application Default Credentials / Project ID.");
  } else {
    // Mock initialization for offline development
    console.warn("[Auth] WARNING: No Firebase Admin credentials found. Using MOCK auth verification for development.");
    // In a real scenario, this shouldn't be used in production.
  }
} catch (error) {
  console.error("[Auth] Firebase Admin initialization error:", error);
}

// Extend Request interface to include the user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authenticateUser = (dbCommand: any) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];

    try {
      let decodedToken: any = null;

      // Check if we are running in mock mode
      if (!isFirebaseInitialized) {
         // MOCK VERIFICATION
         if (token === "MOCK_VALID_TOKEN") {
             decodedToken = {
                 uid: "mock_user_123",
                 email: "mock@example.com",
                 name: "Mock User"
             };
         } else {
             throw new Error("Invalid mock token");
         }
      } else {
         decodedToken = await admin.auth().verifyIdToken(token);
      }

      req.user = decodedToken;

      // JIT Profile Creation (Eventual Consistency with Upsert)
      if (dbCommand) {
        try {
          const usersCollection = dbCommand.collection('users');
          
          await usersCollection.findOneAndUpdate(
            { firebaseUid: decodedToken.uid },
            {
              $setOnInsert: {
                firebaseUid: decodedToken.uid,
                email: decodedToken.email,
                name: decodedToken.name || '',
                picture: decodedToken.picture || '',
                created_at: new Date()
              }
            },
            { upsert: true, returnDocument: 'after' }
          );
        } catch (dbError) {
          console.error('[Auth] Error during JIT user profile creation:', dbError);
          // Depending on requirements, we could block the request here or let it pass 
          // (failing open if it's a transient DB error). We'll let it pass for now.
        }
      }

      next();
    } catch (error) {
      console.error('[Auth] Token verification failed:', error);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };
};

export const deleteFirebaseUser = async (uid: string) => {
    if (isFirebaseInitialized) {
        await admin.auth().deleteUser(uid);
    } else {
        console.warn(`[Auth] Mock mode: Firebase user ${uid} deletion skipped.`);
    }
};
