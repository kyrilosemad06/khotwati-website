/* ============================================================================================
 *  THE ONLY FILE YOU NEED TO EDIT for numbers / price / links.
 * ============================================================================================ */
window.SITE = {
  configured: true,

  // WhatsApp number that receives payment receipts / support (international format, digits only)
  whatsapp: '201508775843',

  // Yearly price shown on the site (change when you decide the final price)
  price: { amount: 99, currency: { ar: 'جنيه', en: 'EGP' } },

  // Where customers send the MONEY.
  payments: [
    { id: 'instapay', name: { ar: 'إنستا باي', en: 'InstaPay' },        value: 'kyrilos06@instapay', link: 'https://ipn.eg/S/kyrilos06/instapay/3QEIdh', color: '#6D28D9', logo: 'assets/img/payments/instapay.png', badge: { ar: 'الأسرع في التحويل', en: 'Fastest transfer' } },
    { id: 'vodafone', name: { ar: 'فودافون كاش', en: 'Vodafone Cash' }, value: '01225986832', color: '#E60000', logo: 'assets/img/payments/vodafone-cash.webp' },
    { id: 'orange',   name: { ar: 'أورنج كاش', en: 'Orange Cash' },     value: '01225986832', color: '#FF7900', logo: 'assets/img/payments/orange-cash.png' },
  ],

  // The APK customers download (file lives in /downloads/)
  apk: { file: 'downloads/Khotwati-Streaks.apk', version: '1.8', size: '1.2 MB', minAndroid: '6.0' },

  // When the app is published put the store links here: the "coming soon" badges become real buttons.
  stores: { play: '', appstore: '' },

  email: 'khotwatiapplication@gmail.com',
  social: {
    facebook: 'https://www.facebook.com/share/198TuVXnxE/',
    instagram: 'https://www.instagram.com/khotwati.app?mdxt=MWdlMW5reWY5NXNnZA==',
    tiktok: 'https://www.tiktok.com/@khotwati.app?_r=1&_t=ZS-9B7V9f3Uf2L',
  },
};
