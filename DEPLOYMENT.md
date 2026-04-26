# Deployment Guide for Vercel

To launch this app for free on Vercel, follow these steps:

## 1. Get a Gemini API Key
1. Visit [Google AI Studio API Keys](https://aistudio.google.com/app/apikey).
2. Create a new API key for free.
3. Copy the key.

## 2. Prepare for Vercel
1. Push your code to a GitHub, GitLab, or Bitbucket repository.
2. Log in to [Vercel](https://vercel.com).
3. Select **"New Project"** and import your repository.

## 3. Configure Environment Variables
During the Vercel setup process:
1. Find the **Environment Variables** section.
2. Add the following:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: `YOUR_COPIED_API_KEY`
3. Click **Add**.

## 4. Deploy
1. Click **Deploy**.
2. Vercel will build the app and provide you with a public URL (e.g., `yuva-hub.vercel.app`).

## Troubleshooting "Lost API"
If you see an error about the API key:
- Ensure the variable name in Vercel is exactly `GEMINI_API_KEY`.
- If you change the key in Vercel, you must **Redeploy** the project for the changes to take effect, as the key is embedded during the build process.
