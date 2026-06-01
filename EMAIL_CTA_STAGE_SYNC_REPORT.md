# Email CTA and Participant Stage Sync Report

## 1. Root Cause
- **Participant Email CTA**: Gmail's default styling overrides were causing the link button text to appear dark/blue and unreadable. Inline styles and an inner `<span>` were required to enforce the white text colour.
- **Judge Email CTA**: The evaluator link button did not match the dark EventOS Hackathon header (`#0f172a`), causing visual inconsistency.
- **Participant Stage Sync**: The `ParticipantPortal` view logic was relying on the JWT token payload to determine the `stage`, resulting in stale stage data across the participant's timeline when the global event state changed.

## 2. Files Changed
- `backend/app/templates/emails/participant_link.html`
- `backend/app/templates/emails/evaluator_link.html`
- `backend/app/services/link_service.py`
- `frontend_new/src/views/ParticipantPortal.jsx`

## 3. Participant Email CTA Fix
- Replaced the simple `<a>` tag with inline CSS styling for the `btn` class.
- Set `background-color: #4f46e5` and forced white text using `color: #ffffff !important` and `-webkit-text-fill-color: #ffffff`.
- Wrapped the anchor text in a `<span>` to ensure Gmail does not override the color.

## 4. Judge Email CTA Fix
- Updated the button background to `#0f172a` to seamlessly align with the dark navy email header.
- Enforced white text using the same `!important` and `-webkit-text-fill-color` approach as the participant email.
- Added a subtle drop shadow (`box-shadow: 0 4px 6px rgba(15, 23, 42, 0.25)`) to elevate the button design.

## 5. Participant Stage Sync Fix
- Modified `backend/app/services/link_service.py`'s `_load_participant_view` method to disregard the token's stage payload.
- Dynamically fetched the `current_stage` directly from the event state service.
- Ensured the returned timeline `status` properties (active, pending, completed) align seamlessly with the real-time global stage rather than static JWT assertions.
- Adjusted `frontend_new/src/views/ParticipantPortal.jsx` by reducing the React Query `staleTime` to `0` and adding a `refetchInterval` of `15000` ms, enabling live UI updates when administrators modify the hackathon stage.

## 6. Validation Results
- Python `compileall` executed successfully without errors for backend components.
- Frontend React codebase builds properly via Vite with zero remaining unused variable errors in the adjusted code.
- Search assertions for the modified templates accurately reflect the application of inline CSS styles.

## 7. Manual Test Results
- ✅ Participant emails received now boast readable, white-styled CTA button text against the indigo background.
- ✅ Judge emails properly match the dark navy theme of the top header.
- ✅ Advancing the stage in the Admin Dashboard now immediately updates the Participant Portal after a refresh or within the 15-second polling interval.
