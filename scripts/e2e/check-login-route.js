const URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

(async () => {
  try {
    const res = await fetch(`${URL}/supervisor/login`);
    console.log('status', res.status);
    const html = await res.text();
    console.log(html.slice(0, 300));
    console.log('has form', /id=\"email\"/.test(html), /id=\"password\"/.test(html));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
