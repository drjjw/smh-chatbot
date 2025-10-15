# PM2 Cleanup & Fix

## 🚨 **Current Issue**

You have 2 manual-bot instances running:
- **ID 4**: 307 restarts, 100% CPU, 148MB - **CRASHING**
- **ID 5**: Just started, healthy

---

## 🔧 **Fix Now**

Run these commands on your server:

```bash
# Stop and delete all manual-bot instances
pm2 delete manual-bot

# Wait a moment
sleep 2

# Start fresh with correct path
cd /var/www/ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/bot/
pm2 start server.js --name "manual-bot"

# Save configuration
pm2 save

# Check status
pm2 status
```

---

## 📍 **Correct Deployment Path**

Based on your URL, the files should be at:
```
/var/www/ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/bot/
```

NOT:
```
/var/www/ukidney.com/content/manuals/bot/  ❌
```

---

## ✅ **What to Do Now**

1. **Stop crashing instances**: `pm2 delete manual-bot`
2. **Upload dist/ files** to correct location
3. **Choose deployment method**:
   - **A. Subdomain** (bot.ukidney.com) - Cleanest
   - **B. Fix Joomla .htaccess** - More work
   
Which would you prefer? Or is the bot already running somewhere and you just need to fix the PM2 crashes?

