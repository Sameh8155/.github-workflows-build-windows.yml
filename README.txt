IPTV Player - نسخة ويندوز (Electron)

1) أنشئ مستودع GitHub جديد وارفع محتويات هذا المجلد (main.js, preload.js, index.html, renderer.js, style.css, package.json, iptv.m3u).
2) أنشئ يدوياً الملف .github/workflows/build-windows.yml (Add file > Create new file) والصق محتوى build-windows.yml.
3) من Actions شغّل Build Windows EXE وانتظر العلامة الخضراء، ثم نزّل iptv-player-windows من Artifacts.
4) فك الضغط وشغّل IPTV-Player.exe (نسخة محمولة بدون تثبيت).

استخدام البرنامج:
- أعلى/أسفل: تغيير القناة.  F أو نقر مزدوج على الفيديو: ملء الشاشة.
- زر "إضافة قنوات": أضف قناة برابطها، أو قائمة m3u من رابط أو ملف. القنوات المضافة تظهر تحت "قنواتي" وتتحفظ.
