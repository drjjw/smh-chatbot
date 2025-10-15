# UKidney.com Manual Assistant - Deployment Package

This `dist` folder contains everything needed to deploy to ukidney.com.

---

## 📦 **Contents**

```
dist/
├── server.js                  # Node.js backend server
├── package.json              # Dependencies list
├── .env                      # Environment variables (API keys)
├── smh-manual-2023.pdf       # PDF document
├── public/
│   └── index.html           # Chat interface
└── docs/
    ├── README.md            # Full documentation
    ├── DEPLOYMENT.md        # Deployment instructions
    ├── PRODUCTION-CHECKLIST.md
    └── UKIDNEY-INTEGRATION.md
```

---

## 🚀 **Quick Deploy**

### **Upload Location:**
```
/var/www/ukidney.com/content/manuals/bot/
```

### **Deploy Commands:**
```bash
# 1. Upload all files
scp -r dist/* user@ukidney.com:/var/www/ukidney.com/content/manuals/bot/

# 2. SSH to server
ssh user@ukidney.com

# 3. Install dependencies
cd /var/www/ukidney.com/content/manuals/bot/
npm install --production

# 4. Start with PM2
pm2 start server.js --name "manual-bot"
pm2 save

# 5. Configure Nginx (see DEPLOYMENT.md)
```

---

## ✅ **After Deployment**

Your chatbot will be live at:
**https://ukidney.com/content/manuals/bot/**

---

## 📚 **Documentation**

- **DEPLOYMENT.md** - Server setup & Nginx configuration
- **PRODUCTION-CHECKLIST.md** - Step-by-step deployment guide
- **UKIDNEY-INTEGRATION.md** - How to add modal to your pages

---

## 🔐 **Security Note**

The `.env` file contains API keys. Ensure:
```bash
chmod 600 .env
```

Never commit `.env` to git!

---

## 🆘 **Support**

After deployment, test with:
```bash
curl https://ukidney.com/content/manuals/bot/api/health
```

Expected response:
```json
{
  "status": "ok",
  "pdfLoaded": true,
  "document": "smh-manual-2023.pdf",
  "pdfPages": 193
}
```

---

**This package is ready to upload to ukidney.com!** 🚀

