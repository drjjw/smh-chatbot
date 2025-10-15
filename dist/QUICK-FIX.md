# 🚨 Quick Fix Guide

## Your Current Issues:

1. ✅ **Path identified**: `/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/`
2. ⚠️ **PM2 crashing**: Instance restarting 307 times
3. ⚠️ **404 errors**: Apache/Joomla blocking requests

---

## 🔧 **Fix in 3 Steps:**

### **Step 1: Clean PM2**
```bash
ssh user@ukidney.com
pm2 delete manual-bot
pm2 save
```

### **Step 2: Upload Fresh Files**

Upload entire `dist/` folder to:
```
/var/www/ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/bot/
```

### **Step 3: Start Clean**
```bash
cd /var/www/ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/bot/
npm install --production
pm2 start server.js --name "manual-bot" --watch false
pm2 save
pm2 logs manual-bot
```

---

## ✅ **Your URLs Will Be:**

- **Chatbot**: `https://ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/bot/`
- **Health**: `https://ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual/bot/api/health`

---

## 🎯 **The .htaccess File**

The `dist/.htaccess` file is already configured with your correct path!

Upload it with your files and it should work.

---

## 🆘 **If Still Not Working:**

**Check PM2 logs:**
```bash
pm2 logs manual-bot --err
```

**Common issues:**
- Port 3000 already in use
- PDF file not found
- .env missing or incorrect
- Node.js version < 18

---

Ready to try? The dist/ folder has everything updated! 🚀

