Kinaflix 🎬

Kinaflix is a modern, user-friendly movie streaming platform that allows users to browse, watch, and engage with movies and series. Built with a client-side architecture, Kinaflix leverages Firebase for real-time data, authentication, and analytics, and is deployed on Vercel for seamless hosting. Whether you're discovering the latest releases, managing your watchlist, or sharing movie recommendations, Kinaflix offers a rich and interactive experience.
Live Demo (Hosted on Vercel)
Features

Browse Movies: Explore a curated collection of movies with sections like Latest Movies, For You, and Genres.
Watch Movies: Stream movies directly via Google Drive links or watch trailers on YouTube.
User Engagement:
Add movies to your watchlist.
Comment on movies (authenticated users only).
Share movie links via clipboard or WhatsApp.


Series Support: View related episodes for series with a dedicated series section.
Responsive Design: Optimized for mobile, tablet, and desktop devices.
Search & Discovery: Search movies and browse personalized recommendations.
Analytics: Tracks user interactions (e.g., page views, movie watches) with Firebase Analytics.
Authentication: Secure user login via Firebase Authentication.

Tech Stack

Frontend: HTML5, CSS3, JavaScript (ES Modules)
Backend: Firebase (Firestore, Authentication, Analytics)
Libraries:
Font Awesome 6.0.0 for icons
Firebase SDK 11.8.1
Google Analytics (via gtag.js)


Hosting: Vercel
Tools: Vercel CLI, Git, Node.js

Prerequisites
Before setting up Kinaflix locally, ensure you have the following installed:

Node.js (v16 or higher)
Vercel CLI (npm install -g vercel)
Git
A Firebase account with a project set up
A Google Drive account (for movie streaming links, optional)
A WhatsApp group link (for sharing, optional)

Installation

Clone the Repository:
git clone https://github.com/your-username/kinaflix.git
cd kinaflix


Install Dependencies:Since Kinaflix is a static site, no npm packages are required for the frontend. However, install Vercel CLI for deployment:
npm install -g vercel


Set Up Firebase:

Go to Firebase Console.
Create a new project (e.g., kinaflix).
Enable Firestore, Authentication (Email/Password), and Analytics.
Copy your Firebase config object (found in Project Settings > General > Your apps > Web app):const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};


Create a .env file in the project root and add your Firebase config:VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL=YOUR_DATABASE_URL
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID


Note: Kinaflix uses client-side Firebase, so the config is embedded in index.html and see.html. For security, consider server-side rendering or environment variable injection in production.


Configure Firestore Rules:

In Firebase Console, go to Firestore > Rules and add:rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /movies/{movieId} {
      allow read: if true;
    }
    match /series/{seriesId} {
      allow read: if true;
    }
    match /comments/{commentId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /watchlists/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}


Deploy rules:firebase deploy --only firestore:rules




Set Up Vercel:

Link your project to Vercel:vercel


Follow prompts to configure (use defaults for a static site).
Add environment variables in Vercel Dashboard > Settings > Environment Variables, using the .env values.



Running Locally

Start a Local Server:Since Kinaflix is a static site, use Vercel’s development server:
vercel dev

Alternatively, use a simple HTTP server:
npx http-server .

Open http://localhost:8080 (or the port shown).

Test Features:

Navigate to http://localhost:8080/ for the homepage.
Visit http://localhost:8080/see.html?id=<movieId> to test a movie page (replace <movieId> with a valid Firestore movies document ID).
Ensure Firebase Authentication is working by logging in via login.html (if implemented).



Usage
For Users

Browse Movies: Visit the homepage (/) to explore Latest Movies, For You, or Genres.
Watch a Movie: Click a movie card to go to see.html?id=<movieId>. Use the “Tangira Kureba” button to stream via Google Drive.
Comment: Log in to add comments on movie pages (requires Firebase Authentication).
Manage Watchlist: Add or remove movies from your watchlist (authenticated users only).
Share: Copy movie links or join the WhatsApp group for updates.
Search: Use the search feature to find movies by title or genre.

For Developers

Add Movies: Populate the movies collection in Firestore with documents containing:{
  "title": "Movie Title",
  "posterImageUrl": "https://example.com/poster.jpg",
  "genres": ["Action", "Drama"],
  "country": "USA",
  "releaseYear": 2023,
  "description": "Movie description",
  "googleDriveLink": "https://drive.google.com/file/d/xyz/view",
  "youtubeTrailerUrl": "https://www.youtube.com/watch?v=xyz",
  "seriesId": "optional_series_id",
  "dateAdded": "2025-05-24T00:00:00Z"
}


Add Series: Add documents to the series collection with a name field and link movies via seriesId.
Customize: Modify index.html for homepage content or see.html for movie page features.
Deploy: Push changes to GitHub and deploy via Vercel:git add .
git commit -m "Add new feature"
git push
vercel --prod



Project Structure
kinaflix/
├── index.html          # Homepage with navigation and movie listings
├── see.html            # Movie detail page (watch, comment, trailer)
├── genre.html          # Genre browsing page
├── pass.html           # Password-related page (e.g., login/reset)
├── sitemap.xml         # SEO sitemap for search engines
├── .env                # Environment variables (Firebase config)
├── vercel.json         # Vercel configuration (rewrites for SPA)
├── README.md           # This file

Contributing
We welcome contributions to Kinaflix! To contribute:

Fork the Repository:
git clone https://github.com/your-username/kinaflix.git
cd kinaflix


Create a Branch:
git checkout -b feature/your-feature


Make Changes:

Add features, fix bugs, or improve documentation.
Follow coding standards (e.g., consistent HTML/CSS, modular JavaScript).
Test locally with vercel dev.


Submit a Pull Request:

Push your branch:git push origin feature/your-feature


Open a PR on GitHub with a clear description of changes.
Reference any issues (e.g., #123).


Code Review:

Respond to feedback and update your PR as needed.
Ensure tests (if added) pass.



Contribution Ideas:

Add movie ratings or reviews.
Implement offline caching with Service Workers.
Enhance search with fuzzy matching.
Add unit tests for JavaScript functions.

License
This project is licensed under the MIT License. See the LICENSE file for details.
Contact

Project Maintainer: [Your Name] (your.email@example.com)
GitHub Issues: Report bugs or suggest features
WhatsApp Group: Join for updates

Acknowledgments

Firebase for backend services.
Vercel for hosting and deployment.
Font Awesome for icons.
Google Drive for movie streaming links.
YouTube for trailers.

Thank you for using and contributing to Kinaflix! 🎥
