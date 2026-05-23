// Simple route checker for local dashboard dev server
const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
const urls = [
  { url: `${baseUrl}/signin`, expected: [200] },
  { url: `${baseUrl}/supervisor/login`, expected: [200] },
  { url: `${baseUrl}/admin`, expected: [307, 302] },
  { url: `${baseUrl}/admin/leads`, expected: [307, 302] },
  { url: `${baseUrl}/admin/lenders`, expected: [307, 302] },
  { url: `${baseUrl}/admin/ai`, expected: [307, 302] },
  { url: `${baseUrl}/admin/testing`, expected: [307, 302] }
];

async function wait(ms){return new Promise(r=>setTimeout(r,ms));}

async function checkUrl(url){
  for(let i=0;i<30;i++){
    try{
      const res = await fetch(url, {redirect:'manual'});
      console.log(url, '->', res.status);
      const text = await res.text();
      console.log('Preview:', text.replace(/\n/g,' ').slice(0,300));
      return {url, status: res.status, ok: res.ok};
    }catch(err){
      process.stdout.write('.');
      await wait(2000);
    }
  }
  console.log('\nFAILED to reach', url);
  return {url, status: 0, ok:false};
}

(async ()=>{
  console.log('Checking dashboard routes...');
  const results = [];
  for(const route of urls){
    const r = await checkUrl(route.url);
    const ok = route.expected.includes(r.status);
    results.push({ ...r, ok });
  }
  const failed = results.filter(r=>!r.ok);
  if(failed.length){
    console.error('\nOne or more routes failed:', failed.map(f=>f.url));
    process.exit(2);
  }
  console.log('\nAll routes responded.');
})();
