# UX/UI Specification

## 1. Design System & Theming
*   **Typography:** highly legible sans-serif (e.g., Inter or Roboto). Large base font size (18px) for accessibility.
*   **Color Palette:** High-contrast minimalist. Off-white background, deep charcoal text. Accent color for interactive elements (e.g., bright blue or teal).
*   **Tone:** Objective, calm, and educational.

## 2. Component Architecture
### Consumer App (Cross-Platform)
*   **Mobile View (Swipe Cards):**
    *   Container: 100vh, 100vw. No scrollbars. 
    *   Card UI: Centered. Image header (if available), bold headline, 3-4 sentences of simple body text.
    *   Interaction: Tinder-style physics. Swipe left/right/up (direction doesn't matter for MVP, just advances to the next card). Swipe down brings older one.
*   **Web View (Masonry Grid):**
    *   Container: Max-width 1200px, centered.
    *   Layout: Pinterest-style responsive masonry grid. 1 column on mobile-web, 2 on tablet, 3-4 on desktop.

### Admin Dashboard (Desktop Web)
*   **Layout:** Two-pane split screen.
*   **Left Pane (Queue):** List of today's 10 generated drafts grouped by Confidence Score (High to Low).
*   **Right Pane (Editor):** 
    *   Top: Link to original source text.
    *   Middle: Textarea containing the AI's generated headline and summary.
    *   Bottom: Action Bar with [Approve & Publish], [Reject], [Save Changes].