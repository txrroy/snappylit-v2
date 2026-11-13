# Product Requirements Document: The Morning Paper

## 1. Product Overview
An agentic, daily news application for all ages. It autonomously fetches the day's top most impactful global news stories, rewrites them into simple, age-appropriate language, and scores them for safety/accuracy. A human editor approves the drafts, which are then published to end-users via a swipeable mobile interface and a masonry web layout.

## 2. Core Workflows
*   **The AI Pipeline (CRON job):** Runs daily at 4:00 AM. Fetches top global news, filters out celebrity/clickbait, rewrites 10 items, calculates a Confidence Score (0-100), and saves to database with status="draft".
*   **The Editor Loop:** Editor logs into the web dashboard, views the "draft" queue. For each item, they see the original source, AI rewrite, and Confidence Score. They can click [Approve], [Edit], or [Reject].
*   **The Consumer Loop:** Users open the app and view today's published cards. Mobile users swipe through one card at a time; web users view a Pinterest-style grid. 

## 3. MVP Scope
*   **Admin Web Dashboard:** Authenticated route. Table view of drafts. WYSIWYG editor for corrections.
*   **Consumer Client:** Read-only access to published articles. Responsive design (Mobile Swipe / Web Grid).
*   **Backend:** Serverless endpoints to trigger the agent pipeline and serve the JSON feed to the clients.