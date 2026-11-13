# Technical Architecture & Stack

## 1. Tech Stack
*   **Frontend / Mobile:** React Native (managed by Expo) + Expo Web for the browser version.
*   **Styling:** Tailwind CSS (via NativeWind).
*   **Backend / Database:** Firebase (Firestore for database, Firebase Auth for Admin login).
*   **Web Hosting & CI/CD:** Hostinger (Business Web Hosting plan) using the "Web App -> Import from GitHub" auto-deployment workflow.
*   **AI Orchestration:** Standalone Node.js scripts executed via Hostinger Cron Jobs, calling the Gemini API.

## 2. Agent Pipeline Design (Hostinger Cron)
*   **Agent 1 (The Fetcher):** Uses a search API (e.g., Google News or Perplexity API) to pull 50 current affairs articles. Filters by "global impact" and discards entertainment/gossip.
*   **Agent 2 (The Summarizer):** Takes the top 10 articles. Prompted to act as a children's educator. Outputs a 10-word headline and 50-word summary.
*   **Agent 3 (The Judge):** Cross-references the generated summary against the source text for hallucinations. Outputs a JSON object: `{ "confidence_score": 85, "reasoning": "..." }`.

## 3. Database Schema (Firestore)
**Collection: `articles`**
*   `id` (string, UUID)
*   `date` (timestamp, YYYY-MM-DD)
*   `original_url` (string)
*   `ai_headline` (string)
*   `ai_summary` (string)
*   `confidence_score` (number, 0-100)
*   `status` (enum: 'draft', 'published', 'rejected')
*   `approved_by` (string, user ID - nullable)