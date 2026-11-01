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
    { id: 'instapay', name: { ar: 'إنستا باي', en: 'InstaPay' },        value: 'kyrilos06@instapay', link: 'https://ipn.eg/S/kyrilos06/instapay/3QEIdh', color: '#6D28D9' },
    { id: 'vodafone', name: { ar: 'فودافون كاش', en: 'Vodafone Cash' }, value: '01225986832', color: '#E60000' },
    { id: 'orange',   name: { ar: 'أورنج كاش', en: 'Orange Cash' },     value: '01225986832', color: '#FF7900' },
  ],

  // The APK customers download (file lives in /downloads/)
  apk: { file: 'downloads/Khotwati-Streaks.apk', version: '1.8', size: '1.2 MB', minAndroid: '6.0' },

  // When the app is published put the store links here: the "coming soon" badges become real buttons.
  stores: { play: '', appstore: '' },

  email: '',
};
