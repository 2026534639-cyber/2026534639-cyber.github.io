// 理不尽的随笔编辑器 — 零依赖本地服务（node editor.mjs → http://localhost:4999）
// 读写 D:\blog\src\content\posts\，发布按钮执行 git add/commit/push 触发 Pages 自动部署
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname);
const POSTS = path.join(ROOT, 'src', 'content', 'posts');
const ASSETS = path.join(ROOT, 'public', 'assets');
const PORT = 4999;
await fs.mkdir(ASSETS, { recursive: true });

/* ---------- frontmatter 工具 ---------- */

function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return { fm: {}, body: text };
	const fm = {};
	let curKey = null;
	for (const line of m[1].split(/\r?\n/)) {
		const t = line.trim();
		if (!t) continue;
		const kv = t.match(/^([A-Za-z]+):\s*(.*)$/);
		if (kv && !t.startsWith('-')) {
			curKey = kv[1];
			let v = kv[2].trim();
			// Fuwari 用行内数组：tags: ["随笔", "工具"]
			if (/^\[.*\]$/.test(v)) {
				fm[curKey] = v
					.slice(1, -1)
					.split(',')
					.map(s => s.trim().replace(/^["']|["']$/g, ''))
					.filter(Boolean);
				curKey = null;
				continue;
			}
			v = v.replace(/^["']|["']$/g, '');
			if (v === 'true') v = true;
			else if (v === 'false') v = false;
			fm[curKey] = v;
		} else if (t.startsWith('-') && curKey) {
			if (!Array.isArray(fm[curKey])) fm[curKey] = [];
			fm[curKey].push(t.slice(1).trim());
		}
	}
	return { fm, body: m[2] };
}

function buildFile(p) {
	const tags = p.tags && p.tags.length ? p.tags : ['随笔'];
	const category = p.category || tags[0] || '随笔';
	const q = s => `"${String(s).replace(/"/g, "'")}"`;
	return `---
title: ${q(p.title)}
published: ${p.published}
description: ${q(p.description || '')}
tags: [${tags.map(q).join(', ')}]
category: ${q(category)}
draft: ${!!p.draft}
---

${p.content.replace(/\r\n/g, '\n').trimEnd()}
`;
}

function safeName(raw) {
	let n = String(raw || '')
		.toLowerCase()
		.replace(/\.md$/, '')
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	if (!n) n = `post-${new Date().toISOString().slice(0, 10)}`;
	return n + '.md';
}

/* ---------- API ---------- */

async function listPosts() {
	const names = (await fs.readdir(POSTS)).filter(f => f.endsWith('.md'));
	const posts = [];
	for (const name of names) {
		const raw = await fs.readFile(path.join(POSTS, name), 'utf8');
		const { fm } = parseFrontmatter(raw);
		posts.push({
			name,
			title: fm.title || name,
			draft: !!fm.draft,
			tags: fm.tags || [],
			published: fm.published || '',
		});
	}
	posts.sort((a, b) => String(b.published).localeCompare(String(a.published)));
	return posts;
}

async function gitPublish(message) {
	const opt = { cwd: ROOT, windowsHide: true };
	const out = [];
	try {
		await run('git', ['add', '-A'], opt);
		try {
			const c = await run('git', ['commit', '-m', message || '随笔更新'], opt);
			out.push(c.stdout.trim());
		} catch (e) {
			if (/nothing to commit/.test(e.stderr || '')) {
				return { ok: true, output: '没有需要发布的新更改。' };
			}
			throw e;
		}
		const p = await run('git', ['push'], opt);
		out.push((p.stdout + p.stderr).trim());
		return { ok: true, output: out.join('\n') + '\n\n✅ 已发布，一两分钟后见：https://2026534639-cyber.github.io/' };
	} catch (e) {
		return { ok: false, output: `发布失败：\n${(e.stderr || e.message).trim()}` };
	}
}

const server = http.createServer(async (req, res) => {
	const json = (code, obj) => {
		res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify(obj));
	};
	const readBody = () =>
		new Promise((resolve, reject) => {
			let d = '';
			req.on('data', c => {
				d += c;
				if (d.length > 15e6) reject(new Error('too large'));
			});
			req.on('end', () => {
				try {
					resolve(d ? JSON.parse(d) : {});
				} catch (e) {
					reject(new Error('请求体不是合法 JSON：' + e.message));
				}
			});
		});
	try {
		const url = new URL(req.url, 'http://127.0.0.1');
		if (req.method === 'GET' && url.pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(html);
		} else if (url.pathname === '/api/posts' && req.method === 'GET') {
			json(200, await listPosts());
		} else if (url.pathname === '/api/post' && req.method === 'GET') {
			const name = safeName(url.searchParams.get('name'));
			const raw = await fs.readFile(path.join(POSTS, name), 'utf8');
			const { fm, body } = parseFrontmatter(raw);
			json(200, {
				name,
				title: fm.title || '',
				tags: (fm.tags || []).join(', '),
				description: fm.description || '',
				draft: !!fm.draft,
				published: fm.published || '',
				content: body,
			});
		} else if (url.pathname === '/api/save' && req.method === 'POST') {
			const p = await readBody();
			const name = safeName(p.name || p.title);
			const d = new Date();
			const pad = n => String(n).padStart(2, '0');
			const pub =
				p.published ||
				`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+08:00`;
			const tagList = String(p.tags || '')
				.split(/[,，]/)
				.map(t => t.trim())
				.filter(Boolean);
			const post = {
				title: p.title || '无题',
				tags: tagList,
				category: tagList[0] || '随笔',
				description: p.description || '',
				draft: p.draft !== false,
				published: pub,
				content: p.content || '',
			};
			await fs.writeFile(path.join(POSTS, name), buildFile(post), 'utf8');
			json(200, { ok: true, name });
		} else if (url.pathname === '/api/delete' && req.method === 'POST') {
			const { name } = await readBody();
			await fs.rm(path.join(POSTS, safeName(name)));
			json(200, { ok: true });
		} else if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
			// 编辑器预览用的静态图片服务（与线上 /assets/ 路径一致）
			const fname = path.basename(url.pathname);
			const types = {
				'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
				'.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
				'.avif': 'image/avif',
			};
			const ext = path.extname(fname).toLowerCase();
			if (!types[ext]) return json(404, { error: 'unsupported type' });
			const data = await fs.readFile(path.join(ASSETS, fname));
			res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'public, max-age=86400' });
			res.end(data);
		} else if (url.pathname === '/api/upload' && req.method === 'POST') {
			const { name, data } = await readBody();
			const buf = Buffer.from(String(data || ''), 'base64');
			if (!buf.length || buf.length > 10e6) return json(400, { error: '图片为空或超过 10MB' });
			const ext = path.extname(String(name || '')).toLowerCase();
			if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext))
				return json(400, { error: '不支持的图片格式（png/jpg/gif/webp/svg/avif）' });
			const d = new Date();
			const pad = n => String(n).padStart(2, '0');
			const fname = `img-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}${ext}`;
			await fs.writeFile(path.join(ASSETS, fname), buf);
			json(200, { ok: true, url: `/assets/${fname}` });
		} else if (url.pathname === '/api/publish' && req.method === 'POST') {
			const { message } = await readBody();
			json(200, await gitPublish(message));
		} else {
			json(404, { error: 'not found' });
		}
	} catch (e) {
		json(500, { error: String(e.message || e) });
	}
});

/* ---------- 界面 ---------- */

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>随笔编辑器 · Blog</title>
<style>
:root{--bg:#faf9f7;--ink:#1c1c1c;--mut:#8a8a86;--line:#e6e4e0;--card:#fff;--acc:#1c1c1c}
@media(prefers-color-scheme:dark){:root{--bg:#161616;--ink:#e8e6e3;--mut:#8f8d89;--line:#2c2b29;--card:#1f1f1e;--acc:#e8e6e3}}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font:15px/1.7 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
.wrap{display:grid;grid-template-columns:280px 1fr;gap:0;min-height:100vh}
.side{border-right:1px solid var(--line);padding:24px 16px;display:flex;flex-direction:column;gap:6px}
.brand{font-family:Georgia,serif;font-size:19px;letter-spacing:.5px;margin-bottom:4px}
.brand small{display:block;font-family:inherit;color:var(--mut);font-size:12px;letter-spacing:2px}
.pitem{padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.pitem:hover{background:var(--card)}
.pitem.on{border-color:var(--line);background:var(--card)}
.pitem b{display:block;font-weight:600;font-size:14px;line-height:1.4}
.pitem span{font-size:12px;color:var(--mut)}
.badge{display:inline-block;font-size:11px;border:1px solid var(--mut);color:var(--mut);border-radius:99px;padding:0 8px;margin-left:6px}
.main{padding:32px 48px;max-width:900px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
input[type=text]{background:var(--card);border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:9px 12px;font:inherit;width:100%}
#title{font-family:Georgia,serif;font-size:22px;font-weight:600}
textarea{width:100%;min-height:52vh;background:var(--card);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:18px;font:14px/1.8 Consolas,"Microsoft YaHei",monospace;resize:vertical}
button{cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:8px 16px;font:inherit;font-size:14px}
button:hover{border-color:var(--mut)}
button.pri{background:var(--acc);color:var(--bg);border-color:var(--acc)}
button.danger{color:#c0392b;border-color:#c0392b55}
label.ck{font-size:13px;color:var(--mut);display:flex;gap:5px;align-items:center;user-select:none}
#status{margin-top:14px;font-size:13px;color:var(--mut);white-space:pre-wrap;font-family:Consolas,monospace;max-height:180px;overflow:auto;border-top:1px dashed var(--line);padding-top:10px}
#preview{display:none;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:24px 28px;min-height:52vh}
#preview h1,#preview h2{font-family:Georgia,serif;margin:.8em 0 .4em}
#preview p{margin:.6em 0}
#preview pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto}
#preview code{font:13px Consolas,monospace}
#preview img{max-width:100%}
#preview blockquote{border-left:3px solid var(--line);padding-left:14px;color:var(--mut);margin:.6em 0}
.fld{font-size:12px;color:var(--mut);margin:10px 0 4px;letter-spacing:1px}
a{color:var(--ink)}
</style>
</head>
<body>
<div class="wrap">
  <div class="side">
    <div class="brand">随笔编辑器<small>BLOG</small></div>
    <button id="newBtn">＋ 新随笔</button>
    <div class="fld">已发布 / 草稿</div>
    <div id="list"></div>
    <div class="fld" style="margin-top:auto">
      <a href="https://2026534639-cyber.github.io/" target="_blank">打开博客 ↗</a>
    </div>
  </div>
  <div class="main">
    <div class="row"><input type="text" id="title" placeholder="标题"></div>
    <div class="row">
      <input type="text" id="name" placeholder="文件名（英文短横线，如 my-first-post）" style="flex:1">
      <input type="text" id="tags" placeholder="标签，逗号分隔（第一个会当作分类）" style="flex:1">
    </div>
    <div class="row">
      <input type="text" id="desc" placeholder="一句话摘要" style="flex:2">
      <label class="ck"><input type="checkbox" id="draft" checked>草稿（不上线）</label>
    </div>
    <textarea id="content" placeholder="正文，支持 Markdown……"></textarea>
    <div id="preview"></div>
    <div class="row" style="margin-top:14px">
      <button class="pri" id="pubBtn">保存并发布</button>
      <button id="saveBtn">仅保存</button>
      <button id="prevBtn">预览</button>
      <button id="imgBtn">🖼 图片</button>
      <input type="file" id="imgFile" accept="image/*" multiple hidden>
      <button class="danger" id="delBtn">删除</button>
      <span id="saved" style="font-size:12px;color:var(--mut)"></span>
    </div>
    <div id="status">改动只存在本地，点「保存并发布」才会推到线上。写作过程中每几秒自动暂存在浏览器里，关掉也不丢。</div>
  </div>
</div>
<script>
const $=id=>document.getElementById(id);
let curName=null,isNew=true,timer=null;
const md=(()=>{const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
return t=>{let out='';
t.split(/(\`\`\`[\\s\\S]*?\`\`\`)/).forEach(seg=>{
if(seg.startsWith('\`\`\`')){out+='<pre><code>'+esc(seg.replace(/^\`\`\`\\w*\\n?/,'').replace(/\`\`\`$/,''))+'</code></pre>';return;}
const lines=esc(seg).split('\\n');let para=[],inList=false;
const flush=()=>{if(para.length){out+='<p>'+para.join('<br>')+'</p>';para=[];}};
for(const l of lines){
let x=l;
if(/^###\\s/.test(x)){flush();out+='<h3>'+x.replace(/^###\\s/,'')+'</h3>';continue}
if(/^##\\s/.test(x)){flush();out+='<h2>'+x.replace(/^##\\s/,'')+'</h2>';continue}
if(/^#\\s/.test(x)){flush();out+='<h1>'+x.replace(/^#\\s/,'')+'</h1>';continue}
if(/^&gt;\\s?/.test(x)){flush();out+='<blockquote>'+x.replace(/^&gt;\\s?/,'')+'</blockquote>';continue}
if(/^[-*]\\s/.test(x)){if(!inList){flush();out+='<ul>';inList=true}out+='<li>'+x.replace(/^[-*]\\s/,'')+'</li>';continue}
if(inList){out+='</ul>';inList=false}
if(!x.trim()){flush();continue}
x=x.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g,'<img alt="$1" src="$2">')
   .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2" target="_blank">$1</a>')
   .replace(/\\*\\*([^*]+)\\*\\*/g,'<b>$1</b>')
   .replace(/\\*([^*]+)\\*/g,'<i>$1</i>')
   .replace(/\`([^\`]+)\`/g,'<code>$1</code>');
para.push(x);}
if(inList)out+='</ul>';flush();});
return out;};})();
async function api(u,b){const r=await fetch(u,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:undefined);const j=await r.json();if(j.error)throw new Error(j.error);return j}
async function loadList(){const ps=await api('/api/posts');$('list').innerHTML=ps.map(p=>\`<div class="pitem" data-n="\${p.name}"><b>\${p.title}\${p.draft?'<span class="badge">草稿</span>':''}</b><span>\${(p.published||'').slice(0,10)} · \${p.name}</span></div>\`).join('');
document.querySelectorAll('.pitem').forEach(el=>el.onclick=()=>openPost(el.dataset.n));if(ps.length&&!curName)openPost(ps[0].name);}
async function openPost(name){const p=await api('/api/post?name='+encodeURIComponent(name));curName=name;isNew=false;
$('title').value=p.title;$('name').value=p.name.replace(/\\.md$/,'');$('name').readOnly=true;$('tags').value=p.tags;$('desc').value=p.description;$('content').value=p.content;$('draft').checked=p.draft;
markActive();hidePreview();$('saved').textContent='';}
function newPost(){curName=null;isNew=true;['title','name','tags','desc','content'].forEach(i=>$(i).value='');$('name').readOnly=false;$('draft').checked=true;hidePreview();markActive();$('title').focus();}
function collect(){return{name:$('name').value,title:$('title').value,tags:$('tags').value,description:$('desc').value,draft:$('draft').checked,content:$('content').value}}
async function save(publish){const p=collect();if(!p.title.trim()){status('先起个标题');return}
if(!p.name.trim()){p.name='post-'+new Date().toISOString().slice(0,10)}
try{const r=await api('/api/save',p);curName=r.name;isNew=false;$('name').value=r.name.replace(/\\.md$/,'');$('name').readOnly=true;markActive();localStorage.removeItem('essay-draft');
let msg=\`已保存 \${r.name}\${p.draft?'（草稿，不上线）':''}\`;
if(publish){status(msg+'，正在推送……');const pub=await api('/api/publish',{message:p.title});status(msg+'\\n\\n'+pub.output);}
else status(msg);
loadList();}catch(e){status('出错：'+e.message)}}
function status(t){$('status').textContent=t}
function markActive(){document.querySelectorAll('.pitem').forEach(el=>el.classList.toggle('on',el.dataset.n===curName))}
function showPreview(){$('preview').innerHTML=md($('content').value||'*(空)*');$('preview').style.display='block';$('content').style.display='none';$('prevBtn').textContent='编辑'}
function hidePreview(){$('preview').style.display='none';$('content').style.display='block';$('prevBtn').textContent='预览'}
$('newBtn').onclick=newPost;
$('saveBtn').onclick=()=>save(false);
$('pubBtn').onclick=()=>save(true);
$('prevBtn').onclick=()=>{$('preview').style.display==='none'&&$('content').style.display!=='none'?showPreview():hidePreview()};
$('delBtn').onclick=async()=>{if(!curName){status('当前没有打开的文章');return}if(!confirm('确定删除 '+curName+' ？（本地删除后需点「保存并发布」才会从线上移除）'))return;await api('/api/delete',{name:curName});newPost();status('已删除本地文件，点「保存并发布」同步线上。');loadList()};
function backup(){clearTimeout(timer);timer=setTimeout(()=>localStorage.setItem('essay-draft',JSON.stringify({...collect(),isNew,curName})),800)}
['title','tags','desc','content'].forEach(i=>$(i).addEventListener('input',backup));
async function uploadFile(f){status('上传图片中：'+f.name);try{
const b64=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result.split(',')[1]);fr.onerror=rej;fr.readAsDataURL(f)});
const r=await api('/api/upload',{name:f.name,data:b64});
insertAtCursor('\\n![图片]('+r.url+')\\n');status('图片已插入 '+r.url+'，随文章一起发布上线');}catch(e){status('图片上传失败：'+e.message)}}
function insertAtCursor(text){const t=$('content');const s=t.selectionStart??t.value.length;const e=t.selectionEnd??s;t.value=t.value.slice(0,s)+text+t.value.slice(e);t.selectionStart=t.selectionEnd=s+text.length;t.focus();backup()}
$('imgBtn').onclick=()=>$('imgFile').click();
$('imgFile').onchange=e=>{[...e.target.files].forEach(uploadFile);e.target.value=''};
document.addEventListener('paste',e=>{const fs=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(fs.length){e.preventDefault();fs.forEach(uploadFile)}});
(function restore(){const s=localStorage.getItem('essay-draft');if(!s)return;try{const p=JSON.parse(s);if(!p.title&&!p.content)return;['title','name','tags','desc','content'].forEach(i=>$(i).value=p[i]||'');$('draft').checked=p.draft!==false;curName=p.curName||null;isNew=!!p.isNew;$('name').readOnly=!isNew;status('已恢复上次未保存的草稿（浏览器暂存）')}catch(e){}})();
loadList();
</script>
</body>
</html>`;

server.listen(PORT, '127.0.0.1', () => {
	console.log(`随笔编辑器已启动 → http://localhost:${PORT}`);
});
