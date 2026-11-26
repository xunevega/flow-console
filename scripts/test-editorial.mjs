import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const directory = await mkdtemp(join(tmpdir(), "flow-editorial-"));
const port = 19473;
const origin = "http://127.0.0.1:" + port;
const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", PORT: String(port), DATA_DIRECTORY: directory, CONSOLE_PASSWORD: "test-password", SESSION_SECRET: "test-secret", N8N_URL: "http://127.0.0.1:1", N8N_API_KEY: "test-key" };
let child, cookie = "";
async function start() {
  child = spawn(process.execPath, ["server.mjs"], { env, stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + "/health")).ok) return; } catch {}
    if (child.exitCode !== null) throw Error("Server exited");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("Server did not start");
}
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
}
async function request(path, method = "GET", body, expected = 200) {
  const res = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  assert.equal(res.status, expected, path + ": " + JSON.stringify(data));
  if (path === "/api/login" && res.ok) cookie = res.headers.get("set-cookie").split(";")[0];
  return data;
}
try {
  await start();
  await request("/api/editorial/masters", "GET", undefined, 401);
  await request("/api/editorial/metrics", "GET", undefined, 401);
  await request("/api/login", "POST", {password: "test-password"});
  const targets = (await request("/api/publication-targets")).targets;
  const channels = ["substack", "substack-notes", "linkedin-newsletter", "medium", "reddit"];
  for (const channel of channels) assert.ok(targets.some(t => t.id === channel));
  await request("/api/editorial/masters", "POST", {title:"", caption:"x"}, 400);
  const {master} = await request("/api/editorial/masters", "POST", {title:"Original", caption:"Original intacto"}, 201);
  const input = {action:"publish", targetId:"substack", masterId:master.id, editorialFormat:"newsletter", caption:"Versión ampliada"};
  await request("/api/publications/post", "POST", {...input,targetId:"unknown"}, 400);
  await request("/api/publications/post", "POST", {...input,masterId:"unknown"}, 400);
  const urls = ["https://example.substack.com/p/test", "https://substack.com/@example/note/c-123", "https://www.linkedin.com/pulse/test", "https://medium.com/@example/test", "https://www.reddit.com/r/example/comments/abc/test"];
  for (const [i,channel] of channels.entries()) {
    const payload = {...input,targetId:channel};
    const {post} = await request("/api/publications/post", "POST", payload);
    assert.equal(post.status,"pending_confirmation");
    assert.equal(post.publishedAt,null);
    assert.equal(post.masterId,master.id);
    assert.equal(post.editorialFormat,"newsletter");
    assert.equal((await request("/api/publications/post","POST",payload)).post.id,post.id);
    const path = "/api/publications/posts/"+post.id+"/confirm";
    await request(path,"POST",{url:"http://example.com/test"},400);
    const confirmed = (await request(path,"POST",{url:urls[i]})).post;
    assert.equal(confirmed.status,"published_by_user_confirmation");
    assert.equal(confirmed.publicUrl,urls[i]);
    assert.ok(confirmed.publishedAt);
  }
  assert.equal((await request("/api/editorial/masters")).masters[0].caption,"Original intacto");
  const metric = {period:"2026-11",channel:"Substack",freeSubscribers:0,paidSubscribers:2,revenue:13.5,leads:""};
  await request("/api/editorial/metrics","PUT",{...metric,period:"2026-13"},400);
  await request("/api/editorial/metrics","PUT",{...metric,paidSubscribers:1.5},400);
  await request("/api/editorial/metrics","PUT",{...metric,revenue:-1},400);
  await request("/api/editorial/metrics","PUT",metric);
  await request("/api/editorial/metrics","PUT",{...metric,revenue:14.5});
  await stop();
  await start();
  const records = (await request("/api/editorial/metrics")).entries;
  assert.equal(records.length,1);
  assert.equal(records[0].freeSubscribers,0);
  assert.equal(records[0].paidSubscribers,2);
  assert.equal(records[0].revenue,14.5);
  assert.equal(records[0].leads,null);
  assert.equal((await request("/api/editorial/masters")).masters[0].id,master.id);
  const posts = (await request("/api/publications/posts")).posts;
  assert.equal(posts.length,5);
  assert.ok(posts.every(p => p.masterId === master.id && p.publishedAt));
  console.log("Editorial API lifecycle passed: authorization, five destinations, validation, deduplication, confirmation, immutable master and persistence after restart.");
} finally {
  await stop();
  await rm(directory,{recursive:true,force:true});
}
