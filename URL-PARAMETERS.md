# URL Parameter Configuration Guide

The chatbot now supports URL parameters for controlling document selection and retrieval method.

## Available Parameters

### 1. `doc` - Document Selection
Selects which manual to use for queries.

**Options:**
- `smh` - SMH Housestaff Manual 2023 (default)
- `uhn` - UHN Nephrology Manual 2025

**Examples:**
```
http://localhost:3456?doc=smh
http://localhost:3456?doc=uhn
```

### 2. `method` - Retrieval Method
Controls whether to use Full Document or RAG retrieval.

**Options:**
- (no parameter) - Full Document mode (default)
- `rag` - RAG (Retrieval Augmented Generation) mode

**Examples:**
```
http://localhost:3456?method=rag
http://localhost:3456
```

## Combined Parameters

You can combine parameters using `&`:

```
http://localhost:3456?doc=uhn&method=rag
http://localhost:3456?doc=smh&method=rag
```

## Production vs Local Behavior

### Local Environment (localhost)
- **Toggle buttons visible** - Users can manually switch between modes
- URL parameters set the initial state
- Buttons override URL parameters when clicked

### Production Environment
- **Toggle buttons hidden** - Only URL parameters control the mode
- Cleaner UI for end users
- Full control through URL configuration

## Use Cases

### 1. Embed with Specific Configuration
Create iframes with pre-configured settings:

```html
<!-- SMH Manual with RAG mode -->
<iframe src="https://your-domain.com/chat?doc=smh&method=rag"></iframe>

<!-- UHN Manual with Full Doc mode -->
<iframe src="https://your-domain.com/chat?doc=uhn"></iframe>
```

### 2. Direct Links
Share links with specific configurations:

```
https://ukidney.com/chat?doc=uhn&method=rag
https://ukidney.com/chat?doc=smh
```

### 3. Testing Locally
Test both modes easily during development:

```
http://localhost:3456?doc=smh
http://localhost:3456?doc=smh&method=rag
http://localhost:3456?doc=uhn
http://localhost:3456?doc=uhn&method=rag
```

## Performance Metadata

Both modes now display performance information at the bottom of each response:

**Full Doc Mode:**
```
📄 Full Doc Mode: Entire 193 pages context (response time: 4250ms)
```

**RAG Mode:**
```
🔍 RAG Mode: Used 3 relevant chunks (retrieval: 1170ms, total: 3420ms)
```

## Default Behavior

If no parameters are provided:
- **Document:** SMH Manual (default)
- **Method:** Full Document mode (default)

```
http://localhost:3456
```
Equivalent to:
```
http://localhost:3456?doc=smh
```

## URL Parameter Priority

1. URL parameters set initial state on page load
2. In local environment, toggle buttons can override URL settings
3. In production, only URL parameters control behavior (no buttons visible)

## Browser Console Logging

Check the browser console to see which mode is active:

**Local Environment:**
```
🏠 Local environment detected - retrieval controls visible
```

**Production Environment:**
```
🌐 Production environment - retrieval controls hidden
```

**RAG Mode Activated:**
```
🔍 RAG mode enabled via URL parameter
```

## Implementation Notes

- URL parameters are read on page load via `URLSearchParams`
- Localhost detection: `hostname === 'localhost' || '127.0.0.1'`
- CSS class `local-env` added to `<body>` for local environment
- Toggle buttons have `display: none` in production via CSS

## Testing Checklist

- [ ] Local: `http://localhost:3456` - Shows toggle buttons
- [ ] Local: `http://localhost:3456?method=rag` - RAG mode active, buttons visible
- [ ] Local: `http://localhost:3456?doc=uhn` - UHN manual loaded, buttons visible
- [ ] Production: Toggle buttons should be hidden
- [ ] Production: `?method=rag` should activate RAG mode
- [ ] Production: `?doc=uhn&method=rag` should use UHN + RAG

## Related Files

- `public/index.html` - Frontend implementation
- `server.js` - Backend endpoints (`/api/chat`, `/api/chat-rag`)
- `RAG-SETUP.md` - RAG system documentation
- `URL-CONFIGURATION.md` - Previous URL configuration (now superseded)

