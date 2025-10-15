# 🚀 Deploy Now - Simple Steps

## ✅ **Updated for Port 3000**

All files in `dist/` are now configured to use port 3000.

---

## 📤 **Upload These Files:**

Upload entire `dist/` folder contents to:
```
/home/ukidney/bot.ukidney.com/
```

**Files to upload:**
- ✅ `.htaccess` (configured for port 3000)
- ✅ `.env` (configured for port 3000)
- ✅ `server.js`
- ✅ `package.json`
- ✅ `smh-manual-2023.pdf`
- ✅ `public/index.html`

---

## 🔧 **On Server, Run:**

```bash
# 1. Clean up
pm2 delete manual-bot
fuser -k 3000/tcp
fuser -k 3001/tcp

# 2. Go to bot directory
cd /home/ukidney/bot.ukidney.com/

# 3. Install dependencies
npm install --production

# 4. Start on port 3000
pm2 start server.js --name "manual-bot" --watch false --max-restarts 1
pm2 save

# 5. Check it worked
pm2 logs manual-bot --lines 5
```

---

## ✅ **You Should See:**

```
✓ PDF loaded successfully
🚀 Server running at http://localhost:3000
📄 PDF-based chatbot ready!
```

**NO MORE PORT ERRORS!**

---

## 🌐 **Test:**

```bash
# From server
curl http://localhost:3000/api/health

# From browser
https://bot.ukidney.com
```

---

**Your dist/ folder is ready to upload!** 🎉

**[Model: Claude Sonnet 4.5]**
