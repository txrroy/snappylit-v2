# Technical Architecture & Stack

## 1. Tech Stack
*   **Frontend / Mobile:** React Native (managed by Expo) + Expo Web for the browser version. Expo Info id: 02a1339d-e706-4088-8472-ed480d99310c
*   **Styling:** Tailwind CSS (via NativeWind).
*   **Backend / Database:** Firebase (Firestore for database, Firebase Auth for Admin login). Firebase db: snappylit-news-firebase
*   **AI Orchestration:** Node.js serverless functions (Vercel or Firebase Cloud Functions) calling the Gemini API.

## 2. Agent Pipeline Design
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