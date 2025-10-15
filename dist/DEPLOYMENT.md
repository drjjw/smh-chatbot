# Deployment Guide for ukidney.com

## 🚀 Deployment Location

**Target URL**: `https://ukidney.com/content/manuals/bot/`

---

## 📦 **Files to Upload**

Upload these files to your server at `/content/manuals/bot/`:

### **Required Files:**
```
/content/manuals/bot/
├── server.js                                   # Node.js server
├── package.json                                # Dependencies
├── .env                                        # Environment variables (secure!)
├── public/
│   └── index.html                             # Chat interface
└── SMH Nephrology Housestaff Manual.- 2023.pdf # PDF document
```

### **Optional Files:**
```
├── README.md                      # Documentation
├── QUICKSTART.md                  # Quick start guide
├── UKIDNEY-INTEGRATION.md         # Integration instructions
└── embed-*.html                   # Embedding examples
```

---

## ⚙️ **Server Setup Steps**

### **Step 1: Install Node.js**
Ensure Node.js v18+ is installed on your server:
```bash
node --version  # Should be v18 or higher
```

### **Step 2: Upload Files**
```bash
# Upload all files to the server
scp -r /Users/jordanweinstein/Downloads/chat/* user@ukidney.com:/var/www/ukidney.com/content/manuals/bot/
```

### **Step 3: Install Dependencies**
```bash
cd /var/www/ukidney.com/content/manuals/bot/
npm install --production
```

### **Step 4: Configure Environment**
Create a `.env` file with your credentials:
```env
GEMINI_API_KEY=your_gemini_api_key_here
XAI_API_KEY=your_xai_api_key_here
PORT=3456

SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

Get your API keys from:
- **Gemini**: [Google AI Studio](https://makersuite.google.com/)
- **Grok/xAI**: [xAI Console](https://console.x.ai/)
- **Supabase**: [Supabase Dashboard](https://supabase.com/dashboard)

### **Step 5: Start with PM2 (Process Manager)**
```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name "manual-bot"

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

### **Step 6: Configure Nginx Reverse Proxy**

Add this to your Nginx configuration:

```nginx
# In your ukidney.com nginx config
location /content/manuals/bot/ {
    proxy_pass http://localhost:3456/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Allow iframe embedding
    add_header X-Frame-Options "ALLOWALL" always;
}
```

Then reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🌐 **Embed Code for UKidney.com Pages**

### **UIkit Modal (Recommended)**

Add this to any page on ukidney.com:

```html
<!-- Trigger Button (add anywhere on your page) -->
<button class="uk-button uk-button-primary" uk-toggle="target: #manual-assistant-modal">
    📚 Open Manual Assistant
</button>

<!-- Modal (add before </body>) -->
<div id="manual-assistant-modal" uk-modal>
    <div class="uk-modal-dialog uk-modal-body" style="width: 95vw; height: 95vh; max-width: 95vw; padding: 0;">
        <button class="uk-modal-close-default" type="button" uk-close></button>
        <iframe 
            src="https://ukidney.com/content/manuals/bot/"
            style="width: 100%; height: 100%; border: none;"
            title="UKidney Manual Assistant"
            allow="clipboard-write">
        </iframe>
    </div>
</div>
```

### **jQuery Modal**

```html
<!-- CSS (add to <head> or stylesheet) -->
<style>
.manual-modal-overlay {
    display: none; position: fixed; top: 0; left: 0;
    width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9998;
}
.manual-modal-container {
    display: none; position: fixed; top: 2.5vh; left: 2.5vw;
    width: 95vw; height: 95vh; background: white;
    border-radius: 8px; z-index: 9999;
}
.manual-modal-close {
    position: absolute; top: 10px; right: 10px;
    width: 40px; height: 40px; background: white;
    border: 2px solid #e0e0e0; border-radius: 50%;
    cursor: pointer; font-size: 24px; text-align: center; line-height: 36px;
}
.manual-modal-close:hover {
    background: #d32f2f; color: white; border-color: #d32f2f;
}
</style>

<!-- HTML (add to page) -->
<button id="openManualAssistant" style="background: #d32f2f; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer;">
    📚 Open Manual Assistant
</button>

<div class="manual-modal-overlay" id="manualModalOverlay"></div>
<div class="manual-modal-container" id="manualModalContainer">
    <button class="manual-modal-close" id="closeManualModal">&times;</button>
    <iframe 
        src="https://ukidney.com/content/manuals/bot/"
        style="width: 100%; height: 100%; border: none; border-radius: 8px;">
    </iframe>
</div>

<!-- JavaScript -->
<script>
$(function() {
    $('#openManualAssistant').click(function() {
        $('#manualModalOverlay, #manualModalContainer').fadeIn(300);
        $('body').css('overflow', 'hidden');
    });
    
    function closeModal() {
        $('#manualModalOverlay, #manualModalContainer').fadeOut(300);
        $('body').css('overflow', '');
    }
    
    $('#closeManualModal, #manualModalOverlay').click(closeModal);
    $(document).keydown(function(e) {
        if (e.key === 'Escape') closeModal();
    });
});
</script>
```

---

## 🔐 **Security Checklist**

Before deploying:

- [ ] ✅ `.env` file permissions set to 600
- [ ] ✅ `.env` excluded from git (already in `.gitignore`)
- [ ] ✅ HTTPS enabled on ukidney.com
- [ ] ✅ Firewall configured (only port 80/443 public)
- [ ] ✅ PM2 running with correct user
- [ ] ✅ Regular backups enabled

---

## 🧪 **Testing Before Going Live**

### **1. Test Locally with Production URL**
Update your local `.env` temporarily:
```env
PORT=3456
BASE_URL=https://ukidney.com/content/manuals/bot/
```

### **2. Test on Server**
```bash
# SSH to server
cd /var/www/ukidney.com/content/manuals/bot/
npm start

# Test from browser
curl http://localhost:3456/api/health
```

### **3. Test Through Nginx**
```bash
curl https://ukidney.com/content/manuals/bot/api/health
```

### **4. Test Modal Integration**
- Add modal code to a test page
- Verify iframe loads
- Test both AI models
- Check conversation logging

---

## 📊 **Post-Deployment Monitoring**

### **Check Logs:**
```bash
# PM2 logs
pm2 logs manual-bot

# Server logs
tail -f /var/log/nginx/access.log | grep "manuals/bot"
```

### **Analytics:**
```bash
curl https://ukidney.com/content/manuals/bot/api/analytics?timeframe=24h
```

### **Database:**
Check Supabase dashboard for conversation logs:
https://supabase.com/dashboard/project/mlxctdgnojvkgfqldaob

---

## 🔄 **Updates & Maintenance**

### **Update PDF:**
```bash
cd /var/www/ukidney.com/content/manuals/bot/
# Upload new PDF (keep same filename or update server.js)
pm2 restart manual-bot
```

### **Update Code:**
```bash
git pull  # If using git
pm2 restart manual-bot
```

### **View Status:**
```bash
pm2 status manual-bot
pm2 monit  # Real-time monitoring
```

---

## 🆘 **Troubleshooting**

### **Chatbot not loading:**
1. Check PM2: `pm2 status`
2. Check logs: `pm2 logs manual-bot`
3. Test direct: `curl localhost:3456/api/health`
4. Check Nginx: `sudo nginx -t`

### **Analytics not working:**
1. Verify Supabase connection
2. Check RLS policies
3. Test: `curl http://localhost:3456/api/analytics`

### **PDF not loading:**
1. Check file path in `server.js`
2. Verify file permissions
3. Check server logs on startup

---

## 📋 **Quick Deploy Checklist**

- [ ] Upload files to `/var/www/ukidney.com/content/manuals/bot/`
- [ ] Run `npm install --production`
- [ ] Configure `.env` file
- [ ] Start with PM2: `pm2 start server.js --name manual-bot`
- [ ] Configure Nginx reverse proxy
- [ ] Test: `curl https://ukidney.com/content/manuals/bot/api/health`
- [ ] Add modal code to ukidney.com page
- [ ] Test modal from live site
- [ ] Monitor logs and analytics

---

## 🎯 **Final URLs**

- **Chatbot**: https://ukidney.com/content/manuals/bot/
- **Health Check**: https://ukidney.com/content/manuals/bot/api/health
- **Analytics**: https://ukidney.com/content/manuals/bot/api/analytics
- **Supabase Dashboard**: https://supabase.com/dashboard/project/mlxctdgnojvkgfqldaob

---

Your chatbot is ready for production deployment! 🚀

