import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './setup.mjs';
import { build } from './build.mjs';
import { publicFiles } from './publication.mjs';

const port = Number(process.env.PORT || 4174);
const clients = new Set();
let running = false;
let pending = false;
let lastError = '';
const notify = (event, data) => clients.forEach(response => response.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
async function rebuild() {
  if (running) { pending = true; return; }
  running = true;
  try {
    await build();
    lastError = '';
    notify('built', {});
  } catch (error) {
    lastError = error.message;
    console.error('\nBuild failed; keeping the previous good preview:\n' + lastError);
    notify('failed', { message: lastError });
  } finally {
    running = false;
    if (pending) { pending = false; await rebuild(); }
  }
}
const liveScript = '<script>const feed=new EventSource("__events");feed.addEventListener("built",()=>location.reload());feed.addEventListener("failed",event=>{let banner=document.getElementById("build-error");if(!banner){banner=document.createElement("pre");banner.id="build-error";banner.setAttribute("role","alert");banner.style="position:fixed;bottom:0;left:0;right:0;z-index:9;background:white;color:#111;border:2px solid #111;padding:16px;max-height:40vh;overflow:auto;white-space:pre-wrap";document.body.append(banner)}banner.textContent="Preview is from the last successful build.\\n"+JSON.parse(event.data).message});</script>';
const server = createServer(async (request, response) => {
  try {
    let path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/resume-cv') { response.writeHead(302, { location:'/resume-cv/' }); response.end(); return; }
    if (path.startsWith('/resume-cv/')) path = path.slice('/resume-cv'.length);
    if (path === '/__events') {
      response.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
      response.write(': connected\n\n');
      clients.add(response);
      if (lastError) response.write('event: failed\ndata: ' + JSON.stringify({message:lastError}) + '\n\n');
      request.on('close', () => clients.delete(response));
      return;
    }
    const file = path === '/' ? 'index.html' : path.slice(1);
    if (!publicFiles.has(file)) { response.writeHead(404); response.end('Not found'); return; }
    let bytes = await readFile(join(root,'dist',file));
    if (file === 'index.html') bytes = Buffer.from(bytes.toString().replace('</body>',liveScript+'</body>'));
    response.writeHead(200, {'content-type':publicFiles.get(file),'cache-control':'no-store'});
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(503, {'content-type':'text/plain'});
    response.end('No successful build yet. Check the terminal for the LaTeX error.');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode=1; });
await rebuild();
server.listen(port, '127.0.0.1', () => console.log('Live preview: http://127.0.0.1:' + port + '/ — save resume/main.tex to rebuild.'));
let timer;
const watchers = ['resume','site','scripts'].map(directory => watch(join(root,directory), (_event,name) => {
  if (!name || !/\.(tex|css|mjs)$/.test(String(name))) return;
  clearTimeout(timer);
  timer=setTimeout(rebuild,150);
}));
function stop() {
  clearTimeout(timer); watchers.forEach(w => w.close()); clients.forEach(c => c.end());
  server.close();
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
