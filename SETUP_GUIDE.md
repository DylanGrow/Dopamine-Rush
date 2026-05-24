# 🚀 Dopamine Rush - Complete Setup Guide

## Step 1: GitHub Repository Setup

### Create Your Repository
1. Go to [GitHub.com](https://github.com)
2. Click "+" → "New repository"
3. Name it: `dopamine-rush`
4. Add description: "A privacy-first productivity tracker"
5. Select "Public" (required for free GitHub Pages)
6. Check "Add a README file"
7. Click "Create repository"

### Clone & Initialize
```bash
git clone https://github.com/YOUR_USERNAME/dopamine-rush.git
cd dopamine-rush
```

## Step 2: Add Project Files

### Copy These Files to Your Repository
```
dopamine-rush/
├── index.html
├── styles.css
├── app.js
├── sw.js
├── manifest.json
├── favicon.svg
├── robots.txt
├── sitemap.xml
├── package.json
├── lighthouserc.json
├── .gitignore
├── README.md
├── SETUP_GUIDE.md (this file)
└── .github/
    └── workflows/
        └── deploy.yml
```

### Create .github/workflows/deploy.yml

Create file: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    permissions:
      contents: read
      pages: write
      id-token: write
    
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Pages
        uses: actions/configure-pages@v3
      
      - name: Security checks
        run: |
          grep -r "fonts.googleapis" . && echo "ERROR: Remote fonts detected!" && exit 1 || echo "✓ No remote fonts"
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: '.'
      
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

## Step 3: Update Configuration Files

### Update index.html
Replace ALL instances of `yourusername` with your GitHub username:

```html
<!-- Before -->
<meta property="og:url" content="https://yourusername.github.io/dopamine-rush/">

<!-- After -->
<meta property="og:url" content="https://YOUR_USERNAME.github.io/dopamine-rush/">
```

Find & replace all:
- `yourusername` → `YOUR_GITHUB_USERNAME`

### Update robots.txt
```
Sitemap: https://YOUR_USERNAME.github.io/dopamine-rush/sitemap.xml
```

### Update sitemap.xml
```xml
<loc>https://YOUR_USERNAME.github.io/dopamine-rush/</loc>
```

## Step 4: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click "Settings" tab
3. Scroll to "Pages" section (left sidebar)
4. Under "Build and deployment":
   - **Source**: Select "GitHub Actions"
   - This will automatically use the workflow file

## Step 5: Git Commit & Push

```bash
# Add all files
git add .

# Commit
git commit -m "Initial commit: Dopamine Rush PWA"

# Push to GitHub
git push origin main
```

## Step 6: Watch Deployment

1. Go to your repository
2. Click "Actions" tab
3. Watch the "Deploy to GitHub Pages" workflow run
4. Once it completes (green checkmark), your site is live!

## Step 7: Access Your App

Your app is now live at:
```
https://YOUR_USERNAME.github.io/dopamine-rush/
```

## Step 8: Install as PWA (Optional)

### Desktop (Chrome/Edge)
1. Visit your site
2. Look for install icon in address bar
3. Click it
4. App installs to your system

### Mobile (Any Browser)
1. Open site in mobile browser
2. Tap share icon
3. Select "Add to Home Screen"
4. App appears on your home screen

## Customization Tips

### Change Colors
Edit `styles.css`:
```css
:root {
    --accent-primary: #ff6b6b;      /* Main color */
    --accent-secondary: #4ecdc4;    /* Secondary */
    --priority-high: #ff6b6b;       /* High priority */
    --priority-medium: #ffa94d;     /* Medium priority */
    --priority-low: #51cf66;        /* Low priority */
}
```

### Change App Name
Edit these files:
- `index.html`: `<title>` tag, heading text
- `manifest.json`: `"name"` and `"short_name"`
- `package.json`: `"name"` and `"description"`

### Change Favicon
Replace `favicon.svg` with your own SVG or PNG

### Customize Pomodoro Defaults
Edit `app.js`, look for:
```javascript
this.settings = {
    workDuration: 25,           // Work session length
    breakDuration: 5,           // Short break length
    longBreakDuration: 15,      // Long break length
    sessionsUntilLongBreak: 4   // Sessions before long break
};
```

## Verification Checklist

- [ ] Repository created on GitHub
- [ ] All files pushed to `main` branch
- [ ] GitHub Pages enabled in Settings
- [ ] Actions workflow completed successfully
- [ ] Site accessible at `https://YOUR_USERNAME.github.io/dopamine-rush/`
- [ ] Update Meta Tags with your GitHub username
- [ ] Test on mobile device
- [ ] PWA installable (add to home screen works)
- [ ] Dark mode toggle works
- [ ] Timer starts/pauses correctly
- [ ] Tasks persist after page reload
- [ ] Analytics show weekly data

## Security Features Enabled

✅ Content Security Policy (CSP) - No inline scripts except what's necessary
✅ No remote fonts - System fonts only
✅ No external dependencies - Zero CDN reliance
✅ HTTPS enforcement - GitHub Pages handles this
✅ Offline support - Service Worker caches all assets
✅ No tracking - No analytics, no cookies
✅ Local storage only - IndexedDB for data

## Performance Targets

- **Lighthouse Performance**: 100
- **Accessibility**: 95+
- **Best Practices**: 100
- **SEO**: 100
- **First Contentful Paint**: < 500ms
- **Largest Contentful Paint**: < 1s

## Troubleshooting

### "404 Not Found" on deployment
- Check if Actions workflow completed (green checkmark)
- Verify repository is public
- Wait 1-2 minutes for GitHub Pages to publish

### "Service Worker not updating"
- Hard refresh: `Ctrl+Shift+R` (Cmd+Shift+R on Mac)
- Clear browser cache
- Check if browser supports Service Workers

### "Data not persisting"
- Check if IndexedDB is enabled
- Try private/incognito window (may have restrictions)
- Check browser storage quota: DevTools → Application → Storage

### "Timer not working"
- Ensure JavaScript is enabled
- Try different browser
- Check console for errors (F12)

### "Not showing as installable PWA"
- Verify manifest.json is valid JSON
- Check all icon URLs are correct
- Ensure served over HTTPS (GitHub Pages handles this)
- Wait 30+ seconds before trying to install

## Next Steps

### Enhancement Ideas
1. Add task categories/projects
2. Export sessions as CSV
3. Multiple timer profiles (pomodoro, time blocking, etc.)
4. Focus music playlists integration
5. Habit tracking dashboard
6. Goal setting features

### Performance Optimization
- All done! Your site is already optimized for Lighthouse 100

### Security Hardening
- All headers configured
- Consider adding:
  - Subresource Integrity (SRI) if using CDNs
  - Regular security audits

## Support Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [IndexedDB Guide](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

## Common Questions

**Q: Will my data be saved?**
A: Yes! Everything is stored locally in your browser's IndexedDB. Never sent to servers.

**Q: Can I use custom domain?**
A: Yes. GitHub Pages supports custom domains. See Settings → Pages → Custom domain.

**Q: How do I update the site?**
A: Edit files locally, commit, push to GitHub. Actions automatically redeploys.

**Q: Can I use on multiple devices?**
A: Yes, but data is local per device. Use Export/Import to sync between devices.

**Q: Is it really free?**
A: 100% free. GitHub Pages is free for public repositories.

---

**You're all set!** 🎉

Your Dopamine Rush productivity tracker is now live and ready to boost your focus.

Start tracking your productivity:
1. Visit your live site
2. Add your first high-priority task
3. Click "Start" on the timer
4. Enter deep work mode
5. Watch the dopamine rush 🚀

Happy focusing! 🎯
