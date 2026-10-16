const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {PORT}=require('../server-port.cjs');
const {probeTarget}=require('./transport-probe.cjs');
const root=path.resolve(__dirname,'..');
const expectedBuild=fs.readFileSync(path.join(root,'dist/index.html'),'utf8').match(/src="([^" ]+\.js)"/)?.[1];
async function verify() {
 let lastFailure='Game process not ready';
 for(let attempt=0;attempt<20;attempt++) {
   const entries=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
   const apps=entries.filter(p=>{try{return fs.realpathSync(p.pm2_env.pm_exec_path)===fs.realpathSync(path.join(root,'server.cjs'));}catch{return false;}});
   let health;
   if(apps.length===1&&apps[0].pm2_env.status==='online'&&apps[0].pm2_env.exec_mode==='fork_mode') {
     try {
       const response=await fetch(`http://127.0.0.1:${PORT}/health`,{signal:AbortSignal.timeout(2000)});
       const result=await response.json();
       if(response.ok&&result.ok&&result.build===expectedBuild&&result.processId===apps[0].pid)health=result;
       else lastFailure='Health response does not match the expected process and build';
     } catch(error) {lastFailure=error.message;}
   }
   if(health) {
     console.log('Checking both local transports; please allow about 20 seconds.');
     const check=await probeTarget('http://127.0.0.1:'+PORT,15000);
     if(!check.ok||check.health.some(h=>h.processId!==apps[0].pid))throw new Error('Local transport stability check failed: '+JSON.stringify(check));
     console.log(`Verified existing PM2 entry ${apps[0].pm_id}, both transports stable, port ${PORT}, build ${health.build}`);
     return;
   }
   await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw new Error(`Deployment failed verification on port ${PORT}: ${lastFailure}. Check pm2 logs Baba-Cyborg-DC.`);
}
verify().catch(error=>{console.error(error.message);process.exitCode=1;});
