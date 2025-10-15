# URL Configuration Guide

## ✅ **Absolute URLs Now Used**

All API calls now use absolute URLs that automatically adapt to the deployment location.

---

## 🔧 **How It Works**

### **JavaScript Auto-Detection:**

```javascript
// Automatically detects the base URL
const BASE_URL = window.location.origin + window.location.pathname.replace(/\/$/, '');
const API_URL = BASE_URL;
```

### **Examples:**

**When running locally:**
- URL: `http://localhost:3000/`
- API_URL: `http://localhost:3000`
- Health Check: `http://localhost:3000/api/health`

**When deployed on ukidney.com:**
- URL: `https://ukidney.com/content/manuals/bot/`
- API_URL: `https://ukidney.com/content/manuals/bot`
- Health Check: `https://ukidney.com/content/manuals/bot/api/health`

---

## 📂 **URL Structure on Production**

### **After Deployment:**

```
https://ukidney.com/content/manuals/bot/          → Chat interface (index.html)
https://ukidney.com/content/manuals/bot/api/health    → Server health check
https://ukidney.com/content/manuals/bot/api/chat      → Chat API endpoint
https://ukidney.com/content/manuals/bot/api/analytics → Analytics
```

---

## 🔄 **Updated Fetch Calls**

### **Before (Relative - wouldn't work):**
```javascript
fetch('/api/health')              // ❌ Would call ukidney.com/api/health
fetch('/api/chat')                // ❌ Would call ukidney.com/api/chat
```

### **After (Absolute - works everywhere):**
```javascript
fetch(`${API_URL}/api/health`)    // ✅ Calls correct URL
fetch(`${API_URL}/api/chat`)      // ✅ Calls correct URL
```

---

## 🎯 **Works In All Scenarios**

### **Scenario 1: Local Development**
```
http://localhost:3000/
→ API calls go to: http://localhost:3000/api/*
✅ Works perfectly
```

### **Scenario 2: Production (Root Domain)**
```
https://chatbot.ukidney.com/
→ API calls go to: https://chatbot.ukidney.com/api/*
✅ Works perfectly
```

### **Scenario 3: Production (Subdirectory)**
```
https://ukidney.com/content/manuals/bot/
→ API calls go to: https://ukidney.com/content/manuals/bot/api/*
✅ Works perfectly
```

### **Scenario 4: Inside Iframe**
```
Embedded in: https://ukidney.com/page.html
Iframe src: https://ukidney.com/content/manuals/bot/
→ API calls go to: https://ukidney.com/content/manuals/bot/api/*
✅ Works perfectly (uses iframe's location, not parent page)
```

---

## 🛠️ **Server Configuration**

### **Express Routes (Already Configured):**

```javascript
app.get('/api/health', ...)      // Accessible at /api/health
app.post('/api/chat', ...)       // Accessible at /api/chat
app.get('/api/analytics', ...)   // Accessible at /api/analytics
app.use(express.static('public')) // Serves index.html
```

### **Nginx Proxy (Production):**

```nginx
location /content/manuals/bot/ {
    proxy_pass http://localhost:3000/;
    # ... proxy headers ...
}
```

**How it routes:**
```
https://ukidney.com/content/manuals/bot/
  → Nginx strips /content/manuals/bot/
  → Proxies to http://localhost:3000/
  → Express serves public/index.html

https://ukidney.com/content/manuals/bot/api/health
  → Nginx strips /content/manuals/bot/
  → Proxies to http://localhost:3000/api/health
  → Express handles the route
```

---

## 🧪 **Testing**

### **Local Testing:**
```bash
# Start server
npm start

# Open browser console at http://localhost:3000/
# You should see:
# "API Base URL: http://localhost:3000"

# Test API directly
curl http://localhost:3000/api/health
```

### **Production Testing (After Deployment):**
```bash
# Test health
curl https://ukidney.com/content/manuals/bot/api/health

# Open in browser
# Navigate to: https://ukidney.com/content/manuals/bot/
# Check browser console:
# "API Base URL: https://ukidney.com/content/manuals/bot"
```

---

## ✅ **Benefits**

1. **No hardcoded URLs** - Works anywhere
2. **Automatic detection** - No configuration needed
3. **Development-friendly** - Same code works locally
4. **Production-ready** - Deploys without changes
5. **Iframe-safe** - Uses iframe's location, not parent

---

## 🚨 **Troubleshooting**

### **If API calls still fail:**

**Check browser console:**
```javascript
console.log('API Base URL:', API_URL);
console.log('Current location:', window.location.href);
```

**Expected in production:**
```
API Base URL: https://ukidney.com/content/manuals/bot
Current location: https://ukidney.com/content/manuals/bot/
```

**If you see incorrect URL**, manually set it:
```javascript
// In public/index.html, replace auto-detection with:
const API_URL = 'https://ukidney.com/content/manuals/bot';
```

---

## 📝 **Summary**

✅ All URLs are now absolute
✅ Auto-detects deployment location
✅ Works locally and in production
✅ No configuration needed
✅ Iframe-compatible
✅ Ready to deploy!

Your chatbot will work correctly at:
**https://ukidney.com/content/manuals/bot/** 🚀

