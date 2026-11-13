# Flowasha System Rules & Context

## Project Overview
You are an expert AI software engineer building Flowasha, an agentic, daily news application for all ages. The system pulls current affairs, rewrites them into simple language using the Gemini API, and requires human-in-the-loop approval before publishing.

## Tech Stack
*   **Framework:** Expo (React Native) with universal routing (Expo Router).
*   **UI/Styling:** NativeWind (Tailwind CSS for React Native).
*   **Backend & DB:** Firebase (Firestore, Auth).
*   **Agent Pipeline:** Standalone Node.js script (scheduled via Hostinger Cron).
*   **Web Deployment:** Hostinger Node.js Web App environment (connected to GitHub).

## Coding Standards & Rules
1.  **Component Architecture:** Always use functional React components with Hooks. Strictly type all components and API responses using TypeScript.
2.  **Routing:** Use Expo Router for all navigation. Organize folders based on the file-based routing paradigm (e.g., `app/(consumer)`, `app/(admin)`).
3.  **Styling:** Use `className` with NativeWind for all styling. Do not use React Native `StyleSheet.create` unless explicitly required for complex animations.
4.  **Database Interactions:** 
    *   Never mock data. Connect directly to the Firebase Emulator suite for local development.
    *   All Firestore interactions must be abstracted into custom hooks (e.g., `useArticles.ts`).
5.  **Agent Pipeline & Hostinger Compatibility:**
    *   The agent code lives in a separate `/agent` directory as a pure Node.js application.
    *   Always use the official Google Gen AI SDK for Node.js (`@google/genai`) when communicating with the Gemini API.
    *   The agent must use `firebase-admin` to bypass client authentication and write drafts directly to Firestore.
    *   Ensure the `package.json` includes clear build scripts (e.g., `"build:web": "npx expo export:web"`) so Hostinger's automated GitHub deployment can execute the build command and target the correct output directory.
6.  **Error Handling & Fallbacks:**
    *   Implement graceful UI degradation if Firestore returns an empty array.
    *   The Agent pipeline must `try/catch` all LLM calls and log failures without crashing the entire script.

## Execution Sequence
Do not attempt to build the entire application at once. Await specific prompts from the Project Manager (the user) for each sprint (e.g., "Scaffold Expo project", "Build Admin UI", "Write Node.js Agent Fetcher").