// Simple route checker for local dashboard dev server
const urls = [
  'http://localhost:3000/signin',
  'http://localhost:3000/supervisor/login',
  'http://localhost:3000/admin',
  'http://localhost:3000/admin/leads',
  'http://localhost:3000/admin/lenders',
  'http://localhost:3000/admin/ai',
  'http://localhost:3000/admin/testing'
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
  for(const u of urls){
    const r = await checkUrl(u);
    results.push(r);
  }
  const failed = results.filter(r=>!r.ok);
  if(failed.length){
    console.error('\nOne or more routes failed:', failed.map(f=>f.url));
    process.exit(2);
  }
  console.log('\nAll routes responded.');
})();
