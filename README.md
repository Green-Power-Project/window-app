# Green Power Customer Portal

A Progressive Web App (PWA) customer portal built with Next.js, TypeScript, and Firebase.

## Features

- 🔐 Firebase Authentication
- 💾 Firebase Firestore for data storage
- 📦 Firebase Storage for file uploads
- 📱 Progressive Web App (PWA) - installable on desktop and mobile
- 📱 Responsive design for desktop and mobile browsers
- ⚡ Built with Next.js 14 and TypeScript

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Firebase project with Authentication, Firestore, and Storage enabled

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up Firebase:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Authentication (Email/Password provider)
   - Create a Firestore database (start in test mode, then update rules)
   - Enable Storage
   - Copy your Firebase config
   
   **Firestore Security Rules** (set in Firebase Console):
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Projects: Customers can only read their own projects
       match /projects/{projectId} {
         allow read: if request.auth != null && request.auth.uid == resource.data.customerId;
         allow create, update, delete: if false; // Only admins can manage projects
       }
     }
   }
   ```
   
   **Projects Collection Structure:**
   Projects must be created manually by administrators. Each project document should have:
   - `name` (string, required): Project name
   - `year` (number, optional): Project year
   - `customerId` (string, required): Firebase Auth UID of the customer
   
   **File Read Tracking:**
   - New files uploaded by admin are considered Unread
   - Unread files appear in `00_New_Not_Viewed_Yet_` folder
   - When customer opens/downloads a file, it's marked as Read
   - Read files are removed from `00_New_Not_Viewed_Yet_` but remain in original folder
   - Read status is stored in `fileReadStatus` Firestore collection
   
   **Storage Security Rules** (set in Firebase Console):
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       // Project files: Customers can read all files, upload only to 01_Customer_Uploads
       match /projects/{projectId}/{folderPath=**} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && folderPath.matches('01_Customer_Uploads.*');
         allow delete: if false; // Customers cannot delete files
       }
     }
   }
   ```
   
   **File Upload Restrictions:**
   - Allowed file types: PDF, JPG, PNG
   - Maximum file size: 20 MB
   - Upload location: Only `01_Customer_Uploads` and its subfolders
   - Customers can view and download all files in their projects
   - Customers cannot delete or edit files

3. Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Building for Production

```bash
npm run build
npm start
```

## PWA Installation

The app is configured as a Progressive Web App (PWA) and can be installed on desktop and mobile devices.

### Installation Methods

**Desktop (Chrome, Edge, Safari):**
- Look for the install prompt in the browser address bar
- Or use the browser menu: Chrome/Edge → "Install Green Power"
- After installation, the app opens in fullscreen/standalone mode
- Single-click access from the desktop/app launcher

**Mobile (iOS Safari, Android Chrome):**
- **iOS**: Tap the Share button → "Add to Home Screen"
- **Android**: Look for the install prompt or use the browser menu → "Add to Home Screen" / "Install app"
- After installation, the app opens in fullscreen/standalone mode
- Single-click access from the home screen

### PWA Features

- ✅ **Installable**: Can be installed on desktop and mobile
- ✅ **App Icons**: Custom icons for home screen/app launcher
- ✅ **Fullscreen Mode**: Opens in standalone mode (no browser UI)
- ✅ **Single-Click Access**: Opens directly from home screen/launcher
- ✅ **Service Worker**: Enabled for app-like experience (offline caching disabled)

**Note**: For the best PWA experience, add icon files to the `/public` directory. See `scripts/generate-icons.md` for instructions on generating the required icon sizes. The app will work without icons, but installation prompts may not appear.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── dashboard/          # Customer portal dashboard (projects list)
│   ├── project/[id]/       # Individual project view
│   ├── login/              # Login page
│   └── forgot-password/    # Password reset page
├── components/             # React components
├── contexts/               # React contexts (Auth)
├── lib/                    # Utilities (Firebase config)
└── public/                 # Static assets (PWA manifest, icons)
```

## Features Overview

- **Authentication**: Email/password authentication with Firebase (login-only, no self-registration)
- **Customer Dashboard**: View all projects assigned to the logged-in customer
- **Project View**: Detailed view for each project
- **Privacy**: Email addresses are not displayed in the UI
- **Security**: Customers can only see their own projects
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Project Management

- Projects are created manually by administrators
- Each customer account can have multiple projects
- Projects display name and optional year
- Customers can only view projects assigned to them via `customerId` field

