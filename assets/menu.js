/* Moved out of index.html so the CSP can forbid inline scripts. */
(function () {
  'use strict';

  // ---- Menu data: edit prices / items here — [English name, price, Arabic name] ----
  var SECTIONS = [
    { title: 'Hot Drinks', ar: 'مشروبات ساخنة', groups: [{ items: [
      ['Turkish Coffee — Single', 45, 'قهوة تركي سنجل'], ['Turkish Coffee — Double', 55, 'قهوة تركي دبل'], ['Tea', 35, 'شاي'], ['Flavored Tea', 40, 'شاي بنكهات'],
      ['Cappuccino', 85, 'كابتشينو'], ['Espresso — Single', 55, 'إسبريسو سنجل'], ['Espresso — Double', 70, 'إسبريسو دبل'], ['Americano', 70, 'أمريكانو'],
      ['Macchiato — Single', 60, 'ماكياتو سنجل'], ['Macchiato — Double', 75, 'ماكياتو دبل'], ['Cortado', 85, 'كورتادو'], ['Flat White', 125, 'فلات وايت'],
      ['Hot Spanish Latte', 135, 'سبانش لاتيه سخن'], ['French Coffee', 60, 'قهوة فرنساوي'], ['Nescafé', 75, 'نسكافيه']] }] },
    { title: 'Iced Coffee', ar: 'قهوة مثلجة', groups: [{ items: [
      ['Iced Latte', 95, 'آيس لاتيه'], ['Iced Cappuccino', 115, 'آيس كابتشينو'], ['Iced Spanish Latte', 140, 'آيس سبانش لاتيه'], ['Iced Americano', 100, 'آيس أمريكانو'],
      ['Iced Mocha', 125, 'آيس موكا'], ['Iced White Mocha', 135, 'آيس وايت موكا'], ['Iced Caramel Latte', 110, 'آيس كراميل لاتيه']] }] },
    { title: 'Frappé', ar: 'فرابيه', groups: [{ items: [
      ['Vanilla Frappé', 130, 'فرابيه فانيليا'], ['Chocolate Frappé', 130, 'فرابيه شوكولاتة'], ['Caramel Frappé', 135, 'فرابيه كراميل'], ['Strawberry Frappé', 125, 'فرابيه فراولة'],
      ['Mocha Frappé', 135, 'فرابيه موكا'], ['White Mocha Frappé', 140, 'فرابيه وايت موكا'], ['Espresso Frappé', 130, 'فرابيه إسبريسو'], ['Matcha Frappé', 140, 'فرابيه ماتشا']] }] },
    { title: 'Milkshake', ar: 'ميلك شيك', groups: [{ items: [
      ['Vanilla Milkshake', 120, 'ميلك شيك فانيليا'], ['Chocolate Milkshake', 130, 'ميلك شيك شوكولاتة'], ['Mango Milkshake', 130, 'ميلك شيك مانجو'], ['Strawberry Milkshake', 130, 'ميلك شيك فراولة'],
      ['Caramel Milkshake', 130, 'ميلك شيك كراميل'], ['Lotus Milkshake', 130, 'ميلك شيك لوتس'], ['Blueberry Milkshake', 130, 'ميلك شيك بلوبيري']] }] },
    { title: 'Fresh Juices', ar: 'عصائر فريش', groups: [{ items: [
      ['Mango Juice', 90, 'عصير مانجو'], ['Strawberry Juice', 90, 'عصير فراولة'], ['Guava Juice', 90, 'عصير جوافة'], ['Lemon Juice', 70, 'عصير ليمون'],
      ['Lemon Mint Juice', 80, 'ليمون نعناع'], ['Banana Milk', 90, 'موز باللبن'], ['Orange Juice', 90, 'عصير برتقال']] }] },
    { title: 'Mojito', ar: 'موهيتو', groups: [{ items: [
      ['Classic Mojito', 90, 'موهيتو كلاسيك'], ['Blueberry Mojito', 110, 'موهيتو بلوبيري'], ['Mango Mojito', 110, 'موهيتو مانجو'], ['Strawberry Mojito', 110, 'موهيتو فراولة'],
      ['Piña Colada Mojito', 130, 'موهيتو بينا كولادا'], ['Peach Mojito', 110, 'موهيتو خوخ'], ['Mixed Berry Mojito', 120, 'موهيتو ميكس بيري'], ['Tropical Mojito', 135, 'موهيتو تروبيكال'],
      ['Jelly Cola Mojito', 110, 'موهيتو جيلي كولا'], ['Watermelon Mojito', 110, 'موهيتو بطيخ']] }] },
    { title: 'Smoothie', ar: 'سموذي', groups: [{ items: [
      ['Blueberry Smoothie', 110, 'سموذي بلوبيري'], ['Mango Smoothie', 120, 'سموذي مانجو'], ['Strawberry Smoothie', 120, 'سموذي فراولة'], ['Mixed Berry Smoothie', 115, 'سموذي ميكس بيري'],
      ['Kiwi Smoothie', 110, 'سموذي كيوي'], ['Passion Fruit Smoothie', 120, 'سموذي باشن فروت'], ['Cola Smoothie', 115, 'سموذي كولا'], ['Watermelon Smoothie', 120, 'سموذي بطيخ'],
      ['Peach Smoothie', 115, 'سموذي خوخ'], ['Mixed Piña Colada', 135, 'ميكس بينا كولادا'], ['Lemon Smoothie', 90, 'سموذي ليمون'], ['Lemon Mint Smoothie', 100, 'سموذي ليمون نعناع']] }] },
    { title: 'Desserts', ar: 'حلويات', groups: [{ items: [
      ['Molten Cake', 130, 'مولتن كيك'], ['Red Velvet Cake', 105, 'ريد فيلفت كيك'], ['Cheesecake', 135, 'تشيز كيك'], ['Chocolate Fudge', 135, 'شوكولاتة فدج']] }] },
    { title: 'Extras', ar: 'إضافات', groups: [
      { label: 'Additional Drinks', ar: 'مشروبات إضافية', items: [['Small Mineral Water', 15, 'مياه معدنية صغيرة'], ['Red Bull', 100, 'ريد بول'], ['Red Bull Mojito', 170, 'موهيتو ريد بول']] },
      { label: 'Additions', ar: 'إضافات', items: [['Latte Art', 35, 'لاتيه آرت'], ['Sauce', 25, 'صوص'], ['Milk', 15, 'لبن']] }] }
  ];

  // ---- Language: English by default, Arabic on request ----
  var TXT = {
    en: {
      est: 'Est. 2026 · Mansoura', tagline: 'Riverside coffee,<br>warm moments.', open: 'PRESS PLAY · OPEN MENU',
      menu: 'Menu', mixtape: 'The Sequoia Mixtape', vol: 'Vol. 01', items: function (n) { return n + ' items'; },
      pick1: 'Pick a track,', pick2: 'we\'ll press play.', prices: 'All prices in EGP', egp: 'EGP',
      sideA: 'SIDE A', sideB: 'SIDE B', track: 'TRACK', rewind: '‹ Rewind', next: 'Next track ›', trackList: 'Track list', finish: 'Finish',
      endB: 'End of side B', thanks: 'THANK YOU', again: 'PLAY IT AGAIN', toggle: 'ع', toggleLabel: 'عربي',
      backCover: 'Back to cover', sections: 'Menu sections', close: 'Close'
    },
    ar: {
      est: 'من 2026 · المنصورة', tagline: 'قهوة على النيل<br>ومود حلو', open: 'شغّل المنيو',
      menu: 'المنيو', mixtape: 'شريط سيكويا', vol: 'الجزء 01', items: function (n) { return n + ' صنف'; },
      pick1: 'اختار تراك،', pick2: 'وإحنا نشغّل.', prices: 'كل الأسعار بالجنيه', egp: 'جنيه',
      sideA: 'الوش الأول', sideB: 'الوش التاني', track: 'تراك', rewind: '› رجوع', next: 'التراك اللي بعده ‹', trackList: 'قايمة التراكات', finish: 'النهاية',
      endB: 'خلص الوش التاني', thanks: 'نورتنا', again: 'شغّله تاني', toggle: 'EN', toggleLabel: 'English',
      backCover: 'رجوع للبداية', sections: 'أقسام المنيو', close: 'إغلاق'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('sq-lang') === 'ar' ? 'ar' : 'en'; } catch (_) {}
  function T(k) { return TXT[lang][k]; }
  function nm(it) { return lang === 'ar' ? it[2] || it[0] : it[0]; }
  function st(s) { return lang === 'ar' ? s.ar || s.title : s.title; }
  function gl(g) { return lang === 'ar' ? g.ar || g.label : g.label.toUpperCase(); }
  function applyLang() {
    app.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    app.classList.toggle('is-ar', lang === 'ar');
    document.documentElement.lang = lang;
  }
  function langBtn(extra) {
    return '<button class="press lang" data-lang aria-label="' + T('toggleLabel') + '"' + (extra ? ' style="' + extra + '"' : '') + '>' + T('toggle') + '</button>';
  }

  var USER = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function acctBtn() { return '<button class="press acct" data-acct aria-label="' + (lang === 'ar' ? 'حسابي' : 'My account') + '">' + USER + '</button>'; }
  var app = document.getElementById('app');
  var CHEV_R = '<svg class="flip" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV_L = '<svg class="flip" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(i) { return String(i + 1).padStart(2, '0'); }
  function count(s) { return s.groups.reduce(function (a, g) { return a + g.items.length; }, 0); }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  // vector logo lockup (tree traced from assets/tree-cream.png by tools/trace-tree.py): sharp on every screen
  var LOGO = '<svg viewBox="0 0 420 748" role="img" aria-label="Sequoia Café" style="position:relative;display:block;width:128px;height:auto;margin-top:28px;color:var(--cream)"><rect x="8" y="8" width="404" height="564" rx="202" fill="none" stroke="currentColor" stroke-width="16"/><path transform="translate(39.6 66) scale(0.96)" fill="currentColor" d="M174.62 1.75Q175.75 1.14 177.62 1.18Q179.5 1.21 181.38 2.48Q183.25 3.75 193.12 16Q203 28.25 207.25 32.25Q211.5 36.25 214.5 38.57Q217.5 40.89 221.75 43.55Q226 46.21 229.88 48.11Q233.75 50 239 51.91Q244.25 53.82 248.75 54.93Q253.25 56.04 253.84 56.52Q254.43 57 254.77 58Q255.11 59 254.86 63.38Q254.61 67.75 252.54 73.75Q250.46 79.75 248.23 83.5Q246 87.25 244.88 88Q243.75 88.75 242.5 89Q241.25 89.25 238.38 88.86Q235.5 88.46 231 86.45Q226.5 84.43 222.25 81.82Q218 79.21 208.38 72.25Q198.75 65.29 196.5 63.88Q194.25 62.46 193.62 62.43Q193 62.39 190.98 65.32Q188.96 68.25 188.36 70.5Q187.75 72.75 187.75 74.88Q187.75 77 188.89 80.62Q190.04 84.25 192 87.25Q193.96 90.25 197.73 93.62Q201.5 97 206.62 99.86Q211.75 102.71 219.25 106.25Q226.75 109.79 237.38 113.34Q248 116.89 262.88 119.55Q277.75 122.21 279.59 123.25Q281.43 124.29 282.09 125.89Q282.75 127.5 282.16 130.5Q281.57 133.5 280.02 137.38Q278.46 141.25 271.34 155.43L264.21 169.61L255.23 166.12Q246.25 162.64 239.5 158.88Q232.75 155.11 226.75 150.98Q220.75 146.86 208.12 136.38Q195.5 125.89 194.96 126.2Q194.43 126.5 193.25 128.5Q192.07 130.5 191.04 134.12Q190 137.75 189.98 141.25Q189.96 144.75 191.11 147.82Q192.25 150.89 197.62 156.57Q203 162.25 209 167.29Q215 172.32 220.5 176.05Q226 179.79 232.38 183.23Q238.75 186.68 244.88 189.25Q251 191.82 259.25 194.34Q267.5 196.86 274.38 198.34Q281.25 199.82 295.62 202.18Q310 204.54 312.62 205.61Q315.25 206.68 316.12 207.59Q317 208.5 317.25 209.25Q317.5 210 317.38 211.5Q317.25 213 315.61 216.75Q313.96 220.5 310.25 231.12Q306.54 241.75 304 247.62Q301.46 253.5 299.71 256.62Q297.96 259.75 295.98 262.25Q294 264.75 291.5 266.29Q289 267.82 288 267.84Q287 267.86 285.12 267.2Q283.25 266.54 276.38 263.5Q269.5 260.46 262.25 256.5Q255 252.54 250 249.38Q245 246.21 238 241.14Q231 236.07 225.5 231.57Q220 227.07 208.88 216.73Q197.75 206.39 197.12 206.7Q196.5 207 195.34 209.25Q194.18 211.5 193.09 215.62Q192 219.75 192 222Q192 224.25 192.43 226.62Q192.86 229 194.29 232.5Q195.71 236 197.55 238.88Q199.39 241.75 201.95 244.75Q204.5 247.75 213.5 255.91Q222.5 264.07 231.5 270.45Q240.5 276.82 250.5 282.34Q260.5 287.86 267.38 290.82Q274.25 293.79 283.25 296.84Q292.25 299.89 305 302.88Q317.75 305.86 332.5 308Q347.25 310.14 350 310.95Q352.75 311.75 353.75 313.25Q354.75 314.75 353.61 319.88Q352.46 325 349.98 331.75Q347.5 338.5 335.66 365.25Q323.82 392 323.41 392.32Q323 392.64 315.88 389.55Q308.75 386.46 300.88 382.45Q293 378.43 286.5 374.68Q280 370.93 272.5 366.04Q265 361.14 256.38 354.61Q247.75 348.07 239.88 341.16Q232 334.25 223.88 326Q215.75 317.75 208.71 309.52Q201.68 301.29 201.21 301.04Q200.75 300.79 200.25 300.95Q199.75 301.11 198.41 302.55Q197.07 304 195.89 306.12Q194.71 308.25 194.07 310.62Q193.43 313 193.25 314.88Q193.07 316.75 193.48 320.12Q193.89 323.5 195.96 329.12Q198.04 334.75 202.23 341.88Q206.43 349 213.46 357.75Q220.5 366.5 229 375Q237.5 383.5 245.75 390.41Q254 397.32 260.12 401.55Q266.25 405.79 269.46 407.52Q272.68 409.25 272.88 409.62Q273.07 410 268.73 421.12Q264.39 432.25 260.43 440.62Q256.46 449 255.84 449.64L255.21 450.29L249.36 446.91Q243.5 443.54 239.75 440.82Q236 438.11 229 432.05Q222 426 211.95 416.27Q201.89 406.54 201.29 406.64Q200.68 406.75 198.8 412.5Q196.93 418.25 195.96 424.5Q195 430.75 195 437.38Q195 444 195.95 450Q196.89 456 198.93 462.25Q200.96 468.5 203.62 473.75Q206.29 479 209.3 483.38Q212.32 487.75 214.91 490.75Q217.5 493.75 220.43 496.52L223.36 499.29L223.05 499.52Q222.75 499.75 220.25 499.77Q217.75 499.79 216.75 500.27Q215.75 500.75 211.88 500.75Q208 500.75 207 501.25Q206 501.75 182.88 501.75Q159.75 501.75 158.88 501.27Q158 500.79 154 500.77Q150 500.75 149 500.27Q148 499.79 145.5 499.77Q143 499.75 140.66 499.09L138.32 498.43L141.88 493.96Q145.43 489.5 147.68 485.62Q149.93 481.75 152.34 475.62Q154.75 469.5 156.27 463.12Q157.79 456.75 158.64 448.75Q159.5 440.75 159.5 435.62Q159.5 430.5 158.64 422.62Q157.79 414.75 157.25 412.25Q156.71 409.75 156.11 408.68Q155.5 407.61 154.12 407.82Q152.75 408.04 150.38 409.71Q148 411.39 132.5 426.07Q117 440.75 113 443.86Q109 446.96 105.88 448.64Q102.75 450.32 102.14 450.21Q101.54 450.11 100.71 449.18Q99.89 448.25 96.61 443Q93.32 437.75 91.77 434.38Q90.21 431 88.68 426.38Q87.14 421.75 86.07 416.12Q85 410.5 85.16 409.02Q85.32 407.54 89.16 405.46Q93 403.39 97.45 400.45Q101.89 397.5 105.95 394.39Q110 391.29 115.88 386.14Q121.75 381 126.62 376.12Q131.5 371.25 135.89 366.25Q140.29 361.25 146.54 352.5Q152.79 343.75 155.88 337.5Q158.96 331.25 159.91 328.38Q160.86 325.5 161.43 322.38Q162 319.25 162 316.38Q162 313.5 161.39 310.88Q160.79 308.25 159.88 306.38Q158.96 304.5 157.73 302.88Q156.5 301.25 156 300.95Q155.5 300.64 154.93 300.95Q154.36 301.25 146.8 310Q139.25 318.75 131.12 326.88Q123 335 115.5 341.52Q108 348.04 103 351.95Q98 355.86 92.88 359.54Q87.75 363.21 79.5 368.48Q71.25 373.75 61.5 379.12Q51.75 384.5 44.88 387.68Q38 390.86 36.88 390.66Q35.75 390.46 33.75 389.27Q31.75 388.07 29.71 386.04Q27.68 384 26.5 382.25Q25.32 380.5 12.66 348.75Q0 317 0.16 316.18Q0.32 315.36 1.04 314.45Q1.75 313.54 4.12 312.41Q6.5 311.29 24.25 308.07Q42 304.86 50.62 302.86Q59.25 300.86 68.88 297.82Q78.5 294.79 87.88 290.82Q97.25 286.86 107.38 281.12Q117.5 275.39 125.12 269.88Q132.75 264.36 137.5 260.3Q142.25 256.25 146.88 251.75Q151.5 247.25 156.77 241Q162.04 234.75 163.36 231.12Q164.68 227.5 164.68 222.88Q164.68 218.25 164.23 216.62Q163.79 215 162.59 212.75Q161.39 210.5 159.82 208.79Q158.25 207.07 157.38 206.82Q156.5 206.57 146.12 216.79Q135.75 227 129.25 232.43Q122.75 237.86 116.38 242.41Q110 246.96 104.38 250.38Q98.75 253.79 93.12 256.71Q87.5 259.64 81.62 262.12Q75.75 264.61 69.12 266.7Q62.5 268.79 61.93 268.27Q61.36 267.75 53.29 249.75Q45.21 231.75 42.73 225Q40.25 218.25 39.75 214.75Q39.25 211.25 39.91 209.38Q40.57 207.5 42.29 206.36Q44 205.21 45.88 204.68Q47.75 204.14 60 202.5Q72.25 200.86 76.75 199.86Q81.25 198.86 89.5 196.32Q97.75 193.79 105 190.73Q112.25 187.68 120.12 183.52Q128 179.36 136 174.29Q144 169.21 149.88 164.86Q155.75 160.5 158.88 156.88Q162 153.25 163.86 149.25Q165.71 145.25 166.11 142.38Q166.5 139.5 166.2 137.38Q165.89 135.25 165.3 133.75Q164.71 132.25 163.48 130.38Q162.25 128.5 160.62 127.2L159 125.89L149.88 134Q140.75 142.11 133 147.82Q125.25 153.54 116.12 158.5Q107 163.46 101.88 165.52Q96.75 167.57 94 168.29L91.25 169L89.59 166.38Q87.93 163.75 84.12 155.88Q80.32 148 78.23 142.88Q76.14 137.75 74.48 132.5Q72.82 127.25 73.29 126.59Q73.75 125.93 75.88 124.62Q78 123.32 81.62 121.79Q85.25 120.25 90.62 119.52Q96 118.79 102.62 117.32Q109.25 115.86 114.75 114.3Q120.25 112.75 126.88 110.36Q133.5 107.96 138.25 105.84Q143 103.71 147.25 101.27Q151.5 98.82 155.12 96.04Q158.75 93.25 160.54 91.38Q162.32 89.5 163.36 88.12Q164.39 86.75 165.61 84.25Q166.82 81.75 167.16 79Q167.5 76.25 166.59 72.75Q165.68 69.25 164.27 66.88Q162.86 64.5 162.05 64.05Q161.25 63.61 144.25 74.18Q127.25 84.75 122.25 87.59Q117.25 90.43 116.12 90.48Q115 90.54 112.16 87.89Q109.32 85.25 106.77 80.88Q104.21 76.5 103.18 73.25Q102.14 70 101.7 66.75Q101.25 63.5 101.27 60.62Q101.29 57.75 102.02 56.96Q102.75 56.18 107.12 55Q111.5 53.82 118.62 50.79Q125.75 47.75 130 45.29Q134.25 42.82 138.12 40.07Q142 37.32 148.12 31.79Q154.25 26.25 158.29 21.62Q162.32 17 166.86 10.75Q171.39 4.5 172.45 3.43Q173.5 2.36 174.62 1.75Z"/><text x="211" y="679" text-anchor="middle" fill="currentColor" font-family="Libre Bodoni, serif" font-weight="700" font-size="70.5">SEQUOIA</text><rect x="43" y="729" width="101" height="3" fill="currentColor"/><rect x="278" y="729" width="101" height="3" fill="currentColor"/><text x="211" y="744" text-anchor="middle" fill="currentColor" font-family="Libre Bodoni, serif" font-size="35" letter-spacing="6">CAFE</text></svg>';

  function cover() {
    // the first screen is the cover as before; the cover page now scrolls to the journal, clubs and social links
    var L = window.SequoiaLanding;
    return '<section class="screen cvscroll' + (L ? '' : ' cvsolo') + '"><div class="cover">' +
      '<div class="forest" aria-hidden="true" style="height:360px;opacity:.55"></div>' +
      '<span style="position:absolute;top:max(14px,env(safe-area-inset-top));inset-inline-end:14px;display:flex;gap:8px;z-index:2">' + acctBtn() + langBtn() + '</span>' +
      '<div class="est caps"><i></i><span>' + T('est') + '</span><i></i></div>' +
      LOGO +
      '<img class="bob" src="assets/mascot-walkman.webp" alt="Sequoia\'s Walkman mascot waving" width="700" height="901" style="position:relative;width:184px;max-width:48vw;height:auto;margin-top:16px">' +
      '<p class="serif-i" style="position:relative;margin:22px 0 0;font-size:21px;line-height:1.3;text-align:center">' + T('tagline') + '</p>' +
      '<div style="flex:1 1 auto;min-height:24px"></div>' +
      '<button class="press btn-primary" data-go="#tracks"><svg class="flip" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg><span>' + T('open') + '</span></button>' +
      (L ? L.more(lang) : '') +
      '</div>' + (L ? L.html(lang) : '') + '</section>';
  }

  function tracks() {
    var rows = SECTIONS.map(function (s, i) {
      return '<button class="press track in" style="animation-delay:' + (i * 40) + 'ms" data-go="#s-' + (i + 1) + '">' +
        '<span class="n">' + pad(i) + '</span>' +
        '<span class="t"><b>' + esc(st(s)) + '</b></span>' +
        '<span class="c">' + T('items')(count(s)) + '</span>' +
        '<span style="color:var(--navy)">' + CHEV_R + '</span></button>';
    }).join('');
    return '<section class="screen" style="padding-top:max(12px,env(safe-area-inset-top))">' +
      '<div class="bar" style="padding:8px 16px 0;height:52px">' +
        '<button class="press ghost" data-go="#" aria-label="' + T('backCover') + '" style="padding-inline-start:4px"><img src="assets/tree-cream.webp" alt="" style="width:20px;height:auto"><span class="display wm" style="font-size:22px;letter-spacing:.08em">SEQUOIA</span></button>' +
        '<span style="display:flex;align-items:center;gap:12px"><span class="caps" style="font-size:13px;letter-spacing:.24em;color:var(--beige)">' + T('menu') + '</span>' + acctBtn() + langBtn() + '</span>' +
      '</div>' +
      '<div class="jcard">' +
        '<div class="jhead"><div class="stripe" style="background:var(--accent)"></div>' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px"><span class="display" style="font-size:28px;line-height:1.1;color:var(--cream)">' + T('mixtape') + '</span><span class="caps" style="font-size:12px;letter-spacing:.18em;color:var(--beige)">' + T('vol') + '</span></div>' +
          '<div class="stripe" style="background:var(--beige)"></div></div>' +
        '<div class="tracks noscroll">' + rows + '</div>' +
      '</div>' +
      '<div class="foot">' +
        '<div style="position:absolute;inset-inline-start:20px;bottom:24px;display:flex;flex-direction:column;gap:4px">' +
          '<span class="serif-i" style="font-size:18px">' + T('pick1') + '</span><span class="serif-i" style="font-size:18px">' + T('pick2') + '</span>' +
          '<span class="caps" style="font-size:11px;letter-spacing:.2em;color:var(--beige);margin-top:4px">' + T('prices') + '</span></div>' +
        '<img class="bob" src="assets/mascot-cassette-v3.webp" width="750" height="557" alt="" style="position:absolute;inset-inline-end:10px;bottom:6px;width:150px;height:auto">' +
      '</div>' + dock() + '</section>';
  }

  function section(i) {
    var s = SECTIONS[i], n = 0, last = SECTIONS.length - 1;
    var chips = SECTIONS.map(function (c, j) {
      return '<button class="press chip" aria-current="' + (j === i) + '" data-go="#s-' + (j + 1) + '">' + esc(st(c)) + '</button>';
    }).join('');
    var body = s.groups.map(function (g) {
      return (g.label ? '<div class="group">' + esc(gl(g)) + '</div>' : '') +
        g.items.map(function (it) {
          var d = Math.min(n++ * 35, 420);
          return '<div class="item in" style="animation-delay:' + d + 'ms"><span class="nm">' + esc(nm(it)) + '</span><span class="dots" aria-hidden="true"></span><span class="pr">' + it[1] + '</span></div>';
        }).join('');
    }).join('');
    var prevLabel = i === 0 ? T('trackList') : st(SECTIONS[i - 1]);
    var nextLabel = i === last ? T('finish') : st(SECTIONS[i + 1]);
    var prevGo = i === 0 ? '#tracks' : '#s-' + i;
    var nextGo = i === last ? '#thanks' : '#s-' + (i + 2);
    return '<section class="screen">' +
      '<div class="bar">' +
        '<button class="press ghost caps" data-go="#tracks" style="font-size:14px;letter-spacing:.18em">' + CHEV_L + '<span>' + T('menu') + '</span></button>' +
        '<span class="wordmark"><img src="assets/tree-cream.webp" alt="" style="width:16px;height:auto"><span class="wm" style="font-size:19px">SEQUOIA</span></span>' +
        '<span style="display:flex;align-items:center;gap:8px;padding-inline-end:6px"><span class="caps" style="font-size:14px;letter-spacing:.08em;color:var(--beige);font-variant-numeric:tabular-nums" dir="ltr">' + pad(i) + ' / ' + pad(last) + '</span>' + acctBtn() + langBtn() + '</span>' +
      '</div>' +
      '<nav class="chips noscroll" id="chips" aria-label="' + T('sections') + '">' + chips + '</nav>' +
      '<div class="scroll noscroll">' +
        '<div class="arch">' +
          '<img src="assets/tree-navy.webp" alt="" style="width:34px;height:auto">' +
          '<span class="pill">' + (i < 5 ? T('sideA') : T('sideB')) + ' · ' + T('track') + ' ' + pad(i) + '</span>' +
          '<h1>' + esc(st(s)) + '</h1>' +
          '<div class="rule caps"><i></i><span>' + T('items')(count(s)) + ' · ' + T('egp') + '</span><i></i></div>' +
        '</div>' +
        '<div class="items">' + body + '<p class="egp caps">' + T('prices') + '</p></div>' +
        '<div class="nav">' +
          '<button class="press ghost prev" data-go="' + prevGo + '"><small class="caps" style="color:var(--beige)">' + T('rewind') + '</small><b style="color:var(--cream)">' + esc(prevLabel) + '</b></button>' +
          '<button class="press next" data-go="' + nextGo + '"><small class="caps" style="color:var(--tan);font-weight:700">' + T('next') + '</small><b style="color:var(--navy);font-weight:700">' + esc(nextLabel) + '</b></button>' +
        '</div>' +
      '</div>' + dock() + '</section>';
  }

  function thanks() {
    return '<section class="screen thanks">' +
      '<div class="forest" aria-hidden="true" style="height:320px;opacity:.5"></div>' +
      '<img class="bob" src="assets/mascot-cassette-v3.webp" width="750" height="557" alt="Sequoia\'s cassette mascot" style="position:relative;width:250px;max-width:66vw;height:auto">' +
      '<span class="caps" style="position:relative;margin-top:26px;font-size:12px;letter-spacing:.3em;color:var(--beige)">' + T('endB') + '</span>' +
      '<h1 class="display" style="position:relative;margin:10px 0 0;font-size:48px;line-height:1.1;letter-spacing:.06em">' + T('thanks') + '</h1>' +
      '<button class="press btn-primary" data-go="#tracks" style="margin-top:36px"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + T('again') + '</span></button>' +
      '</section>';
  }

  // ---- Table service: call the captain, ask for the bill, quick requests ----
  var COOLDOWN = 60 * 1000;   // the same request can be sent again after this
  var FEEDBACK_URL = 'https://forms.gle/VTLfxqve1PRwdxXH9';
  var PAY = [['cash', 'Cash', 'كاش'], ['card', 'Card', 'كارت'], ['instapay', 'InstaPay', 'InstaPay']];
  var QUICK = [['water', 'Water', 'مياه'], ['napkins', 'Napkins', 'مناديل'], ['clean', 'Clean table', 'تنضيف الترابيزة']]; // edit quick requests here: [code, English, Arabic]
  var SV = {
    en: { ready: 'Ready to order', service: 'AT YOUR SERVICE', help: 'How can we help?', table: 'Table', bill: 'Ask for the bill', quick: 'Quick requests',
          captainComing: 'Captain is coming', billComing: 'Bill is coming', isComing: ' is coming', tableW: 'Table',
          onWay: 'On the way!', heading: function (t) { return 'The captain is heading to table ' + t + '.'; },
          billTitle: 'Your bill is coming', paying: function (p, t) { return 'Paying by ' + p + ' · table ' + t + '.'; },
          upTitle: 'Coming right up', forTable: function (x, t) { return x + ' for table ' + t + '.'; },
          fbTitle: 'How was your visit?', fbLine: 'Tell us in 2 minutes — it goes straight to the owner.',
          more: 'Anything else?', back: 'Back to menu', needTable: 'Please enter your table number.',
          fail: 'Couldn\'t reach the captain. Check your connection and try again.' },
    ar: { ready: 'جاهزين نطلب', service: 'في خدمتك', help: 'نقدر نساعدك إزاي؟', table: 'الترابيزة', bill: 'اطلب الحساب', quick: 'طلبات سريعة',
          captainComing: 'الكابتن جاي', billComing: 'الحساب جاي', isComing: ' جاية', tableW: 'ترابيزة',
          onWay: 'الكابتن جاي!', heading: function (t) { return 'الكابتن في الطريق لترابيزة ' + t + '.'; },
          billTitle: 'الحساب جاي', paying: function (p, t) { return 'الدفع ' + p + ' · ترابيزة ' + t + '.'; },
          upTitle: 'جاي حالًا', forTable: function (x, t) { return x + ' لترابيزة ' + t + '.'; },
          fbTitle: 'إيه رأيك في زيارتك؟', fbLine: 'قولنا في دقيقتين، ورأيك هيوصل للأونر على طول.',
          more: 'محتاج حاجة تانية؟', back: 'رجوع للمنيو', needTable: 'اكتب رقم ترابيزتك.',
          fail: 'مقدرناش نوصل للكابتن. اتأكد من النت وجرّب تاني.' }
  };
  function V(k) { return SV[lang][k]; }
  function li() { return lang === 'ar' ? 2 : 1; }
  var BELL = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var X = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } }

  var sent = load('sq-sent') || {};       // key -> {table, at, kind, detail}  (key = kind or kind:item)
  var last = load('sq-last');             // the most recent sent request, for the dock
  // the table comes only from the QR on the table (menu/?table=7); without it, service buttons are hidden
  var qp = /[?&](?:table|t)=(\d{1,3})\b/.exec(location.search);
  var table = qp && +qp[1] > 0 ? String(+qp[1]) : '';

  function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fresh(k) { var s = sent[k]; return s && Date.now() - s.at < COOLDOWN ? s : null; }
  function label(kind, detail) {
    if (kind === 'call') return 'Captain';
    if (kind === 'bill') return (PAY.filter(function (p) { return p[0] === detail; })[0] || [0, detail, detail])[li()];
    return (QUICK.filter(function (q) { return q[0] === detail; })[0] || [0, detail, detail])[li()];
  }
  function dockText(s) {
    var tt = ' · ' + V('tableW') + ' ' + esc(s.table);
    if (s.kind === 'call') return V('captainComing') + tt;
    if (s.kind === 'bill') return V('billComing') + tt;
    return esc(label(s.kind, s.detail)) + V('isComing') + tt;
  }

  function dock() {
    if (!table) return '';
    var s = last && Date.now() - last.at < COOLDOWN ? last : null;
    return '<div class="dock">' + (s
      ? '<button class="press call sent caps" data-call><span class="dot" aria-hidden="true"></span><span>' + dockText(s) + '</span></button>'
      : '<button class="press call caps" data-call>' + BELL + '<span>' + V('ready') + '</span></button>') +
      '</div>';
  }

  var sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.hidden = true;
  var tick = null, view = null; // view: null = options, else the request just sent

  function openSheet() {
    view = null;
    sheet.hidden = false;
    paintSheet();
  }
  function closeSheet() {
    sheet.hidden = true;
    clearInterval(tick); tick = null;
    var d = app.querySelector('.dock');
    if (d) d.outerHTML = dock();
  }

  function optBtn(attr, text, k) {
    var f = fresh(k);
    return '<button class="press opt' + (f ? ' done' : '') + '" ' + attr + (f ? ' disabled' : '') + '>' +
      (f ? '<span class="dot" aria-hidden="true"></span>' : '') + '<span>' + esc(text) + '</span></button>';
  }

  function paintSheet(error) {
    clearInterval(tick); tick = null;
    var html;
    if (view) {
      var v = view, title, line;
      if (v.kind === 'call') { title = V('onWay'); line = V('heading')(esc(v.table)); }
      else if (v.kind === 'bill') { title = V('billTitle'); line = V('paying')(esc(label('bill', v.detail)), esc(v.table)); }
      else { title = V('upTitle'); line = V('forTable')(esc(label(v.kind, v.detail)), esc(v.table)); }
      html = '<img class="bob" src="assets/mascot-walkman.webp" alt="" width="700" height="901" style="width:84px;height:auto;margin-top:6px">' +
        '<h2 id="sheet-title">' + title + '</h2>' +
        '<p class="serif-i" style="font-size:20px">' + line + '</p>' +
        (v.kind === 'bill'
          ? '<a class="press fb" href="' + FEEDBACK_URL + '" target="_blank" rel="noopener"><b>' + V('fbTitle') + '</b><span>' + V('fbLine') + '</span></a>'
          : '') +
        '<button class="press btn-primary caps" data-back style="margin-top:18px"><span>' + V('more') + '</span></button>' +
        '<button class="press linkbtn caps" data-close>' + V('back') + '</button>';
    } else {
      var c = fresh('call');
      html = '<span class="pill">' + V('service') + '</span>' +
        '<h2 id="sheet-title">' + V('help') + '</h2>' +
        '<div class="trow"><span class="tlabel caps">' + V('table') + '</span><span class="tfixed">' + esc(table) + '</span></div>' +
        '<div class="msg" id="tmsg" role="alert">' + (error ? esc(error) : '') + '</div>' +
        '<button class="press btn-primary caps" data-send="call"' + (c ? ' disabled' : '') + '>' + BELL + '<span>' + (c ? V('captainComing') + ' · <span id="cd" dir="ltr">' + mmss(Math.ceil((COOLDOWN - (Date.now() - c.at)) / 1000)) + '</span>' : V('ready')) + '</span></button>' +
        '<span class="olabel caps">' + V('bill') + '</span>' +
        '<div class="opts">' + PAY.map(function (p) { return optBtn('data-send="bill" data-detail="' + p[0] + '"', p[li()], 'bill'); }).join('') + '</div>' +
        '<span class="olabel caps">' + V('quick') + '</span>' +
        '<div class="opts">' + QUICK.map(function (q) { return optBtn('data-send="req" data-detail="' + q[0] + '"', q[li()], 'req:' + q[0]); }).join('') + '</div>';
      // tick the countdown; repaint only when a cooldown ends (keeps typing undisturbed)
      var cooling = Object.keys(sent).filter(function (k) { return fresh(k); });
      if (cooling.length) {
        tick = setInterval(function () {
          var c2 = fresh('call'), cd = sheet.querySelector('#cd');
          if (cd && c2) cd.textContent = mmss(Math.ceil((COOLDOWN - (Date.now() - c2.at)) / 1000));
          if (cooling.some(function (k) { return !fresh(k); })) {
            var y = sheet.querySelector('.panel').scrollTop;
            paintSheet(); sheet.querySelector('.panel').scrollTop = y;
          }
        }, 1000);
      }
    }
    sheet.innerHTML = '<div class="scrim" data-close></div>' +
      '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
        '<div class="grab" aria-hidden="true"></div>' +
        '<button class="press x" data-close aria-label="' + T('close') + '">' + X + '</button>' + html +
      '</div>';
  }

  function send(kind, detail) {
    var key = kind === 'req' ? 'req:' + detail : kind;
    if (fresh(key)) return;
    var v = table;
    if (!v) return;
    sheet.querySelectorAll('[data-send]').forEach(function (b) { b.disabled = true; });
    var at = Date.now(), msg = { type: kind, table: v, rid: at.toString(36) + Math.random().toString(36).slice(2, 6) };
    if (kind === 'bill') msg.pay = detail;
    if (kind === 'req') msg.item = detail;
    var pub = window.SequoiaOrders ? window.SequoiaOrders.publish(msg) : Promise.reject(new Error('offline'));
    pub.then(function () {
      var rec = { table: v, at: at, kind: kind, detail: detail || '' };
      sent[key] = rec; last = rec;
      Object.keys(sent).forEach(function (k) { if (!fresh(k)) delete sent[k]; });
      store('sq-sent', sent); store('sq-last', last);
      view = rec; paintSheet();
      if (kind === 'bill') openReview();
    }).catch(function () {
      paintSheet(V('fail'));
    });
  }

  sheet.addEventListener('click', function (e) {
    var b;
    if (e.target.closest('[data-close]')) closeSheet();
    else if (e.target.closest('[data-back]')) { view = null; paintSheet(); }
    else if ((b = e.target.closest('[data-send]'))) send(b.getAttribute('data-send'), b.getAttribute('data-detail'));
  });
  sheet.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSheet();
  });

  // ---- Google review invite, shown right after a bill request is sent ----
  // Every guest gets the same invite: no rating first, no reward for reviewing (Google policy).
  var REVIEW_URL = (window.SEQUOIA_CONFIG || {}).GOOGLE_REVIEW_URL || '';
  var REVIEW_EVERY = 12 * 3600e3;      // show at most once per 12 hours on this phone
  var REVIEW_AFTER_TAP = 30 * 864e5;   // after tapping "review", don't ask again for 30 days
  var RV = {
    ar: { title: 'شكرًا إنك قعدت معانا 🌿', body: 'لو قعدتك عجبتك، تقييمك على جوجل بيفرق معانا جدًا وبيساعد ناس تانية تلاقينا.',
          go: 'قيّمنا على جوجل ⭐', later: 'مش دلوقتي' },
    en: { title: 'Thanks for spending time with us 🌿', body: 'If you enjoyed your visit, a Google review means a lot to us and helps others find us.',
          go: 'Review us on Google ⭐', later: 'Not now' }
  };
  var LEAF = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var rv = document.createElement('div');
  rv.className = 'rv';
  rv.hidden = true;

  function reviewDue() {
    if (!REVIEW_URL) return false;
    var r = load('sq-review') || {}, now = Date.now();
    if (r.clickedAt && now - r.clickedAt < REVIEW_AFTER_TAP) return false;
    if (r.shownAt && now - r.shownAt < REVIEW_EVERY) return false;
    return true;
  }
  function openReview() {
    if (!reviewDue()) return;
    var r = load('sq-review') || {}, t = RV[lang];
    r.shownAt = Date.now(); store('sq-review', r);
    rv.innerHTML = '<div class="scrim" data-rv-close></div>' +
      '<div class="rv-card" role="dialog" aria-modal="true" aria-labelledby="rv-title">' +
        '<div class="rv-leaf">' + LEAF + '</div>' +
        '<h2 id="rv-title">' + t.title + '</h2>' +
        '<p>' + t.body + '</p>' +
        '<a class="press rv-go" data-rv-go href="' + esc(REVIEW_URL) + '" target="_blank" rel="noopener">' + t.go + '</a>' +
        '<button class="rv-later" type="button" data-rv-close>' + t.later + '</button>' +
      '</div>';
    rv.hidden = false;
    var go = rv.querySelector('[data-rv-go]');
    if (go) go.focus();
  }
  function closeReview() {
    if (rv.hidden) return;
    rv.hidden = true;
    var back = sheet.querySelector('[data-back]');
    if (back && !sheet.hidden) back.focus();
  }
  rv.addEventListener('click', function (e) {
    if (e.target.closest('[data-rv-go]')) {
      var r = load('sq-review') || {};
      r.clickedAt = Date.now(); store('sq-review', r);
      closeReview(); // only hidden, so the link still opens in a new tab
    } else if (e.target.closest('[data-rv-close]')) closeReview();
  });
  rv.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeReview(); }
  });

  function render() {
    var h = location.hash, m = /^#s-(\d+)$/.exec(h), html;
    if (h === '#tracks') html = tracks();
    else if (h === '#thanks') html = thanks();
    else if (m && +m[1] >= 1 && +m[1] <= SECTIONS.length) html = section(+m[1] - 1);
    else html = cover();
    applyLang();
    app.innerHTML = html;
    app.appendChild(sheet);
    app.appendChild(rv);
    if (window.SequoiaLanding) {
      SequoiaLanding.closeJournal();
      var cv = app.querySelector('.cvscroll');
      if (cv) SequoiaLanding.mount(cv, lang);
    }
    if (window.SequoiaAccount) SequoiaAccount.reattach(app);
    var chips = document.getElementById('chips');
    if (chips) {
      var on = chips.querySelector('[aria-current="true"]');
      if (on) chips.scrollLeft = Math.max(0, on.offsetLeft - chips.clientWidth / 2 + on.offsetWidth / 2);
    }
    document.title = m ? st(SECTIONS[+m[1] - 1]) + ' — Sequoia Café' : 'Sequoia Café — ' + T('menu');
  }

  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-call]')) { openSheet(); return; }
    if (e.target.closest('[data-acct]')) { openAccount(); return; }
    if (e.target.closest('[data-lang]')) { lang = lang === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('sq-lang', lang); } catch (_) {} render(); return; }
    var b = e.target.closest('[data-go]');
    if (!b) return;
    var to = b.getAttribute('data-go');
    if (to === '#') { history.pushState('', document.title, location.pathname); render(); }
    else go(to);
  });
  // Sequoia Card: the code is fetched only the first time the account icon is tapped
  var acctLoading = null;
  function openAccount() {
    if (window.SequoiaAccount) return SequoiaAccount.open(app, { table: table });
    if (!acctLoading) acctLoading = new Promise(function (ok, bad) {
      var sc = document.createElement('script'); sc.src = 'assets/account.js'; sc.onload = ok; sc.onerror = function () { acctLoading = null; bad(); };
      document.head.appendChild(sc);
    });
    acctLoading.then(function () { SequoiaAccount.open(app, { table: table }); }, function () {});
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  render();
})();
