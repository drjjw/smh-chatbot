# Disclaimer Feature

## Overview

The disclaimer feature displays a SweetAlert2 modal on first visit, requiring users to acknowledge that the application is for educational use only by healthcare professionals. User consent is stored in a cookie to prevent repeated displays.

## Architecture

The disclaimer system is implemented in a modular way with separate files for maintainability:

### Files

1. **`public/js/disclaimer.js`** - Core disclaimer logic
   - Handles cookie checking
   - Shows SweetAlert2 modal
   - Manages user consent
   - Provides utility functions for testing

2. **`public/css/disclaimer.css`** - Disclaimer-specific styles
   - Button styling (confirm/cancel)
   - Modal animations
   - Responsive design
   - Accessibility features
   - Dark mode support

3. **`public/index.html`** - External dependencies
   - SweetAlert2 (modal library)
   - js-cookie (cookie management)
   - Animate.css (animations)

4. **`public/js/main.js`** - Integration point
   - Imports and calls `showDisclaimerIfNeeded()`

## Dependencies

All dependencies are loaded via CDN:

```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">

<!-- JavaScript -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.jsdelivr.net/npm/js-cookie@3"></script>
```

## Usage

The disclaimer automatically shows on page load if the user hasn't previously agreed:

```javascript
import { showDisclaimerIfNeeded } from './disclaimer.js';

// In your initialization code
showDisclaimerIfNeeded();
```

### Iframe Detection

The disclaimer automatically detects if the app is running inside an iframe and skips the display:

```javascript
// Detection logic (built-in)
if (window.self !== window.top) {
    // Running in iframe - skip disclaimer
    // Parent page should handle disclaimer
    return;
}
```

This is useful when embedding the app in other pages (e.g., `embed-smh-manual.html`), where the parent page handles the disclaimer display.

## Cookie Details

- **Name**: `_ukidney_disclaimer_agree`
- **Value**: `'Yes'` (when accepted)
- **Expiry**: Session only (expires when browser closes)
- **Path**: `/` (site-wide)

## User Flow

1. **First Visit**:
   - User loads the page
   - **If in iframe**: Disclaimer is skipped (parent handles it)
   - **If standalone**: After 500ms delay, disclaimer modal appears
   - User must click "I agree" or "I decline"

2. **User Agrees**:
   - Session cookie is set (expires when browser closes)
   - Modal closes
   - User can interact with the application

3. **User Declines**:
   - User is redirected to `/` (home page)
   - No cookie is set

4. **Same Session Visits** (browser still open):
   - Cookie is detected
   - Modal does not appear
   - User can immediately interact with the application

5. **New Session** (after closing browser):
   - Cookie has expired
   - Disclaimer appears again
   - User must accept again

5. **Iframe Context**:
   - Disclaimer is automatically skipped
   - Parent page is responsible for showing disclaimer
   - Logged to console: "🖼️  Running in iframe - disclaimer handled by parent"

## Testing

The disclaimer module provides utility functions for testing:

```javascript
import { clearDisclaimerCookie, hasAcceptedDisclaimer } from './disclaimer.js';

// Clear the cookie to test the disclaimer again
clearDisclaimerCookie();

// Check if user has accepted
if (hasAcceptedDisclaimer()) {
    console.log('User has accepted disclaimer');
}
```

### Manual Testing

1. Open browser DevTools (F12)
2. Go to Application/Storage → Cookies
3. Delete `_ukidney_disclaimer_agree` cookie
4. Refresh the page
5. Disclaimer should appear

## Customization

### Changing the Message

Edit the `html` content in `disclaimer.js`:

```javascript
html: `
    <div style="text-align: left;">
        <p>Your custom message here...</p>
    </div>
`,
```

### Changing Colors

Edit button colors in `disclaimer.css`:

```css
.swal2-confirm-button {
    background-color: #2c5282; /* Change this */
}

.swal2-cancel-button {
    background-color: #c53030; /* Change this */
}
```

### Changing Cookie Expiry

The cookie is currently set as a **session cookie** (expires when browser closes). To make it persistent:

Edit `disclaimer.js` line ~80:

```javascript
// Current (session cookie):
Cookies.set(COOKIE_NAME, 'Yes', { 
    path: '/'
});

// For persistent cookie (e.g., 30 days):
Cookies.set(COOKIE_NAME, 'Yes', { 
    path: '/',
    expires: 30  // days
});
```

### Changing Redirect on Decline

Edit the redirect URL in `disclaimer.js`:

```javascript
window.location.href = "/"; // Change this URL
```

## Accessibility

The disclaimer includes several accessibility features:

- **Keyboard Navigation**: Users can tab between buttons
- **Focus Indicators**: Clear focus outlines on buttons
- **Screen Reader Support**: Proper ARIA labels from SweetAlert2
- **No Auto-Dismiss**: Modal cannot be closed accidentally
- **High Contrast**: Sufficient color contrast ratios

## Responsive Design

The disclaimer is fully responsive:

- **Desktop**: Full-sized modal with comfortable padding
- **Mobile**: Adjusted font sizes and button padding
- **Tablets**: Scales appropriately between desktop and mobile

## Browser Support

Works in all modern browsers that support:
- ES6 modules
- CSS animations
- Cookies
- SweetAlert2 (IE11+ with polyfills)

## Security Considerations

- Cookie is set with `path: '/'` for site-wide access
- No sensitive data is stored in the cookie
- Cookie value is simple string, not executable code
- Modal prevents interaction until user responds
- No external scripts can bypass the disclaimer

## Maintenance

### Updating Dependencies

All dependencies are loaded from CDN with version pinning:

```html
<!-- Update version numbers as needed -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.jsdelivr.net/npm/js-cookie@3"></script>
```

### Build Process

When building for production:

1. The disclaimer module is included in the bundle
2. External CDN dependencies remain external
3. CSS is concatenated with main styles
4. No additional build steps required

## Troubleshooting

### Disclaimer Doesn't Appear

1. Check browser console for errors
2. Verify CDN scripts are loaded
3. Check if cookie already exists
4. Clear cookies and try again

### Disclaimer Appears Every Time

1. Check if cookies are enabled in browser
2. Verify cookie is being set (check DevTools)
3. Check for cookie path conflicts
4. Verify domain settings

### Styling Issues

1. Check if `disclaimer.css` is loaded
2. Verify no CSS conflicts with main styles
3. Check browser compatibility
4. Clear browser cache

## Future Enhancements

Potential improvements:

- [ ] Add version tracking to cookie (for terms updates)
- [ ] Add analytics tracking for acceptance rate
- [ ] Support multiple languages
- [ ] Add "Learn More" link to detailed terms
- [ ] Add option to review terms later
- [ ] Add checkbox for "Remember my choice"
- [ ] Add audit log for compliance

