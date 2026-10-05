const http=require('http');
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.zip':'application/zip','.xpi':'application/x-xpinstall'};
const safe=p=>{const full=path.resolve(root,'.'+p);return full.startsWith(root)?full:null};
http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    let pathname=decodeURIComponent(u.pathname);
    if(pathname==='/'||pathname==='/admin') pathname='/admin.html';
    const file=safe(pathname);
    if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){
      res.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});return res.end('Not found');
    }
    const ext=path.extname(file).toLowerCase();
    const noCache=/^(admin(?:-|\.|$)|index\.html$)/.test(path.basename(file));
    res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':noCache?'no-store':'public, max-age=300'});
    fs.createReadStream(file).pipe(res);
  }catch(e){res.writeHead(500,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end('Server error');}
}).listen(Number(process.env.PORT||3000),'0.0.0.0');
