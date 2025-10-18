# Disclaimer Feature - Quick Reference

## What Was Added

A modular SweetAlert2-based disclaimer system that shows on first visit and remembers user consent via cookies.

## Files Created/Modified

### New Files
1. **`public/js/disclaimer.js`** - Core disclaimer logic (ES6 module)
2. **`public/css/disclaimer.css`** - Disclaimer-specific styles
3. **`docs/DISCLAIMER-FEATURE.md`** - Complete documentation

### Modified Files
1. **`public/index.html`** - Added CDN dependencies and CSS link
2. **`public/js/main.js`** - Added import and initialization call
3. **`build.js`** - Added disclaimer files to build process
4. **`dist/`** - All corresponding dist files updated

## Quick Test

### Test the Disclaimer (Standalone)

1. **Open the app in your browser** (not in an iframe)
2. **Open DevTools** (F12) → Application/Storage → Cookies
3. **Delete** the `_ukidney_disclaimer_agree` cookie
4. **Refresh** the page
5. **Disclaimer should appear** after 500ms

### Test the Disclaimer (Iframe)

1. **Open the app in an iframe** (e.g., embed-smh-manual.html)
2. **Open DevTools** (F12) → Console
3. **Look for message**: "🖼️  Running in iframe - disclaimer handled by parent"
4. **Disclaimer should NOT appear** (parent handles it)

### Test User Acceptance

1. Click **"I agree"**
2. Cookie should be set
3. Refresh page - disclaimer should NOT appear

### Test User Decline

1. Delete cookie again
2. Refresh page
3. Click **"I decline"**
4. Should redirect to `/` (home page)

## Customization Quick Guide

### Change the Message
Edit `public/js/disclaimer.js` line ~35:
```javascript
html: `<div style="text-align: left;">
    <p>Your custom message...</p>
</div>`,
```

### Change Button Colors
Edit `public/css/disclaimer.css` lines 9 and 23:
```css
.swal2-confirm-button {
    background-color: #2c5282; /* Change this */
}
.swal2-cancel-button {
    background-color: #c53030; /* Change this */
}
```

### Change Cookie Duration
The cookie is currently a **session cookie** (expires when browser closes).

To make it persistent, edit `public/js/disclaimer.js` line ~80:
```javascript
// Add expires property:
Cookies.set(COOKIE_NAME, 'Yes', { 
    path: '/',
    expires: 30  // days
});
```

## Console Commands for Testing

Open browser console and run:

```javascript
// Clear the disclaimer cookie (to test again)
Cookies.remove('_ukidney_disclaimer_agree', { path: '/' });

// Check if user has accepted
Cookies.get('_ukidney_disclaimer_agree');

// Manually set acceptance (bypass disclaimer)
Cookies.set('_ukidney_disclaimer_agree', 'Yes', { path: '/', expires: 365 });
```

## Build & Deploy

The disclaimer is automatically included in the build process:

```bash
# Build for production
node build.js

# Deploy
./deploy.sh
```

The build script now includes:
- `public/css/disclaimer.css` → hashed CSS file
- `public/js/disclaimer.js` → hashed JS file
- CDN dependencies remain external (not bundled)

## Dependencies (CDN)

All loaded from CDN (no npm install needed):
- **SweetAlert2** v11 - Modal library
- **js-cookie** v3 - Cookie management
- **Animate.css** v4.1.1 - Animations

## Cookie Details

- **Name**: `_ukidney_disclaimer_agree`
- **Value**: `'Yes'`
- **Expires**: Session only (when browser closes)
- **Path**: `/` (site-wide)
- **Domain**: Current domain (auto)

**Note**: The disclaimer will appear again each time the user opens a new browser session.

## Troubleshooting

### Disclaimer doesn't appear
1. Check browser console for errors
2. Verify CDN scripts loaded (Network tab)
3. Check if cookie already exists
4. Try incognito/private window

### Disclaimer appears every time
1. Check if cookies are enabled
2. Check browser privacy settings
3. Try different browser
4. Check for cookie domain issues

### Styling issues
1. Clear browser cache
2. Check if `disclaimer.css` is loaded
3. Check for CSS conflicts
4. Inspect element in DevTools

## Architecture

```
Modular Design:
├── disclaimer.js (Logic - separate module)
├── disclaimer.css (Styles - separate file)
├── index.html (CDN dependencies)
└── main.js (Integration point)

Benefits:
✓ Easy to maintain
✓ Easy to customize
✓ Easy to remove if needed
✓ No coupling with app code
✓ Clean separation of concerns
```

## Next Steps

1. **Test thoroughly** in different browsers
2. **Customize message** to match your needs
3. **Adjust styling** to match your brand
4. **Monitor acceptance rate** (optional analytics)
5. **Update terms** as needed (change cookie name for new version)

## Support

For detailed documentation, see:
- `docs/DISCLAIMER-FEATURE.md` - Complete feature documentation
- `public/js/disclaimer.js` - Well-commented source code
- `public/css/disclaimer.css` - Styled with comments

## Removal (if needed)

To remove the disclaimer feature:

1. Remove from `public/index.html`:
   - SweetAlert2 CDN links
   - js-cookie CDN link
   - Animate.css CDN link
   - `disclaimer.css` link

2. Remove from `public/js/main.js`:
   - Import statement
   - `showDisclaimerIfNeeded()` call

3. Delete files:
   - `public/js/disclaimer.js`
   - `public/css/disclaimer.css`

4. Update `build.js`:
   - Remove from `cssFiles` object
   - Remove from `jsFiles` object

5. Rebuild: `node build.js`

