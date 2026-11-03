// Minimal mock of a self-hosted GitLab (OAuth + REST v4 subset) for Ombor end-to-end testing.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_PORT || 4556);
const BASE = `http://127.0.0.1:${PORT}`;
const log = [];

const now = Date.now();
const iso = (daysAgo, h = 0) => new Date(now - daysAgo * 864e5 - h * 36e5).toISOString();
const sha = (s, n = 64) => crypto.createHash("sha256").update(s).digest("hex").slice(0, n);

const me = { id: 7, username: "doniyor", name: "Doniyor Ismoilov", email: "doniyor@example.com", avatar_url: null, web_url: `${BASE}/doniyor`, state: "active" };
const groups = [
  { id: 10, name: "frontend", full_name: "frontend", full_path: "frontend", description: "Frontend team", avatar_url: null, web_url: `${BASE}/frontend`, parent_id: null },
  { id: 11, name: "backend", full_name: "backend", full_path: "backend", description: "Backend team", avatar_url: null, web_url: `${BASE}/backend`, parent_id: null },
];
const perm = (lvl) => ({ project_access: { access_level: lvl }, group_access: null });
const mkProject = (id, ns, path, lvl, visibility = "private", stats = {}) => ({
  id, name: path, path, name_with_namespace: `${ns.name} / ${path}`, path_with_namespace: `${ns.full_path}/${path}`,
  description: `${path} project`, avatar_url: null, web_url: `${BASE}/${ns.full_path}/${path}`, visibility,
  last_activity_at: iso(id % 5), packages_enabled: true, container_registry_enabled: true,
  container_registry_image_prefix: `registry.mock.local/${ns.full_path}/${path}`,
  namespace: { id: ns.id, name: ns.name, path: ns.full_path, kind: ns.kind || "group", full_path: ns.full_path },
  statistics: { storage_size: 0, repository_size: 1e6, lfs_objects_size: 0, job_artifacts_size: 0, packages_size: stats.packages ?? 5e7, container_registry_size: stats.registry ?? 2e8 },
  permissions: perm(lvl),
});
const personalNs = { id: 99, name: "doniyor", full_path: "doniyor", kind: "user" };
const projects = [
  mkProject(101, groups[0], "design-system", 40, "internal", { packages: 120e6, registry: 0 }),
  mkProject(102, groups[0], "web-app", 30, "private", { packages: 10e6, registry: 900e6 }),
  mkProject(201, groups[1], "billing", 50, "private", { packages: 300e6, registry: 1.2e9 }),
  mkProject(202, groups[1], "public-sdk", 20, "public", { packages: 40e6, registry: 0 }),
  mkProject(301, personalNs, "sandbox", 50, "private", { packages: 1e6, registry: 0 }),
];

let nextPkgId = 1000;
let packages = [];
function addPkg(projectId, type, name, version, daysAgo, opts = {}) {
  const id = nextPkgId++;
  const project = projects.find((p) => p.id === projectId);
  const pipeline = opts.manual ? null : { id: 88000 + id, iid: id, project_id: projectId, ref: "main", sha: sha(name + version, 40), status: "success", source: "push", created_at: iso(daysAgo), web_url: `${project.web_url}/-/pipelines/${88000 + id}`, user: { id: 7, username: "doniyor", name: "Doniyor Ismoilov", avatar_url: null } };
  packages.push({
    id, name, version, package_type: type, status: opts.status || "default", created_at: iso(daysAgo, id % 12),
    last_downloaded_at: opts.downloaded === false ? null : iso(Math.max(0, daysAgo - 1)),
    project_id: projectId, project_path: project.path_with_namespace,
    _links: { web_path: `/${project.path_with_namespace}/-/packages/${id}`, delete_api_path: `${BASE}/api/v4/projects/${projectId}/packages/${id}` },
    tags: opts.tags || [], pipeline, pipelines: pipeline ? [pipeline] : [],
    files: (opts.files || [`${name.replace(/[@/]/g, "-")}-${version}.tgz`]).map((f, i) => ({
      id: id * 10 + i, package_id: id, file_name: f, size: 12345 * (i + 1) * (id % 7 + 1), created_at: iso(daysAgo),
      file_md5: sha(f, 32), file_sha1: sha(f + "1", 40), file_sha256: opts.noSha ? null : sha(f + id), pipelines: pipeline ? [pipeline] : [],
    })),
  });
}
let containerRepos = [];

// (Re)creates the fixture data. Called at startup and by POST /__reset so every test run starts clean.
function seed() {
  nextPkgId = 1000;
  packages = [];
  for (const [i, v] of ["4.10.0", "4.11.0", "4.11.1", "4.12.0"].entries()) addPkg(101, "npm", "@acme/ui-kit", v, 20 - i * 5, { tags: i === 3 ? [{ name: "latest" }] : [] });
  for (const [i, v] of ["1.0.0", "1.1.0"].entries()) addPkg(101, "npm", "@acme/icons", v, 40 - i * 10);
  for (const [i, v] of ["2.8.0", "2.8.1"].entries()) addPkg(201, "maven", "com/acme/billing-core", v, 6 - i * 3, { files: ["billing-core.jar", "billing-core.pom"] });
  addPkg(201, "pypi", "acme-ml-features", "0.19.3", 1, { files: ["acme_ml_features-0.19.3-py3-none-any.whl"] });
  addPkg(201, "helm", "payments-service", "3.4.0", 2, { manual: true });
  addPkg(201, "generic", "release-bundle", "2026.11.01", 3, { manual: true, noSha: true });
  addPkg(202, "nuget", "Acme.Logging", "6.0.2", 120, { downloaded: false });
  addPkg(202, "golang", "gitlab.mock.local/backend/public-sdk", "v1.2.0", 10);
  addPkg(102, "npm", "@acme/web-utils", "0.3.0", 0, { status: "error", manual: true });
  addPkg(301, "generic", "scratch-tool", "0.0.1", 15, { manual: true });
  // Dedicated targets for destructive e2e tests (each test owns its own packages).
  for (const [i, v] of ["0.1.0", "0.2.0"].entries()) addPkg(101, "npm", "@acme/legacy-widgets", v, 30 - i * 5);
  addPkg(301, "generic", "bulk-target-a", "1.0.0", 25, { manual: true });
  addPkg(301, "generic", "bulk-target-b", "1.0.0", 26, { manual: true });
  // Old filler packages so the catalog spans more than one page (page size 25).
  for (let i = 1; i <= 24; i++) addPkg(301, "generic", `fixture-${String(i).padStart(2, "0")}`, "1.0.0", 200 + i, { manual: true });

  containerRepos = [
    { id: 501, name: "api-gateway", path: "backend/billing/api-gateway", project_id: 201, location: "registry.mock.local/backend/billing/api-gateway", created_at: iso(90), cleanup_policy_started_at: null,
      tags: ["v1.29.0", "v1.30.0", "v1.31.0", "latest"] },
    { id: 502, name: "", path: "frontend/web-app", project_id: 102, location: "registry.mock.local/frontend/web-app", created_at: iso(60), cleanup_policy_started_at: null, tags: ["main", "sha-abc123"] },
  ];
}
seed();


function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
function paginate(res, url, items) {
  const page = Number(url.searchParams.get("page") || 1);
  const per = Number(url.searchParams.get("per_page") || 20);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const slice = items.slice((page - 1) * per, page * per);
  send(res, 200, slice, { "x-total": String(total), "x-total-pages": String(pages), "x-page": String(page), "x-per-page": String(per), "x-next-page": page < pages ? String(page + 1) : "" });
}
// Drop internal/expanded fields that GitLab does not return from the endpoint.
const omit = (obj, key) => {
  const copy = { ...obj };
  delete copy[key];
  return copy;
};
const publicPkg = (p) => omit(p, "files");
function filterPkgs(url, list) {
  let out = list.filter((p) => p.status !== "deleted");
  const name = url.searchParams.get("package_name");
  const type = url.searchParams.get("package_type");
  const ver = url.searchParams.get("package_version");
  const status = url.searchParams.get("status");
  if (name) out = out.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));
  if (type) out = out.filter((p) => p.package_type === type);
  if (ver) out = out.filter((p) => p.version === ver);
  if (status) out = out.filter((p) => p.status === status);
  const sort = url.searchParams.get("sort") === "asc" ? 1 : -1;
  const by = url.searchParams.get("order_by") || "created_at";
  out = [...out].sort((a, b) => (a[by === "type" ? "package_type" : by] > b[by === "type" ? "package_type" : by] ? sort : -sort));
  return out.map(publicPkg);
}
const tokens = new Map();

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  log.push(`${req.method} ${p}${url.search}`);

  // ---- OAuth ----
  if (p === "/oauth/authorize") {
    const code = "code-" + crypto.randomBytes(6).toString("hex");
    const to = new URL(url.searchParams.get("redirect_uri"));
    to.searchParams.set("code", code);
    to.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: to.toString() });
    return res.end();
  }
  if (p === "/oauth/token" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    if (body.client_secret !== "mock-secret") return send(res, 401, { error: "invalid_client", error_description: "Client authentication failed" });
    const t = "tok-" + crypto.randomBytes(8).toString("hex");
    tokens.set(t, true);
    return send(res, 200, { access_token: t, token_type: "Bearer", refresh_token: "ref-" + t, expires_in: 7200, scope: "api read_user", created_at: Math.floor(now / 1000) });
  }
  if (p === "/oauth/revoke") return send(res, 200, {});
  if (p === "/__log") return send(res, 200, log.slice(-300));
  // Test-control endpoints (not part of GitLab).
  if (p === "/__health") return send(res, 200, { ok: true });
  if (p === "/__reset" && req.method === "POST") {
    seed();
    log.length = 0;
    return send(res, 200, { ok: true, packages: packages.length });
  }
  if (p === "/__state") return send(res, 200, { packages, containerRepos });

  if (!p.startsWith("/api/v4/")) return send(res, 404, { message: "404 Not Found" });
  const api = p.slice("/api/v4".length);
  const auth = req.headers.authorization?.replace("Bearer ", "") || req.headers["private-token"];
  if (api === "/version") return auth ? send(res, 200, { version: "17.5.2", revision: "abc", enterprise: false }) : send(res, 401, { message: "401 Unauthorized" });
  if (!auth || (!tokens.has(auth) && auth !== "svc-token")) return send(res, 401, { message: "401 Unauthorized" });

  let m;
  if (api === "/user") return send(res, 200, me);
  if ((m = api.match(/^\/users\/(\d+)\/projects$/))) return paginate(res, url, projects.filter((x) => x.namespace.kind === "user"));
  if (api === "/groups") return paginate(res, url, groups);
  if ((m = api.match(/^\/groups\/(\d+)$/))) return groups.find((g) => g.id == m[1]) ? send(res, 200, groups.find((g) => g.id == m[1])) : send(res, 404, { message: "404 Group Not Found" });
  if ((m = api.match(/^\/groups\/(\d+)\/subgroups$/))) return paginate(res, url, []);
  if ((m = api.match(/^\/groups\/(\d+)\/projects$/))) return paginate(res, url, projects.filter((x) => x.namespace.id == m[1]));
  if ((m = api.match(/^\/groups\/(\d+)\/packages$/))) {
    const ids = projects.filter((x) => x.namespace.id == m[1]).map((x) => x.id);
    return paginate(res, url, filterPkgs(url, packages.filter((x) => ids.includes(x.project_id))));
  }
  if ((m = api.match(/^\/groups\/(\d+)\/registry\/repositories$/))) {
    const ids = projects.filter((x) => x.namespace.id == m[1]).map((x) => x.id);
    return paginate(res, url, containerRepos.filter((r) => ids.includes(r.project_id)).map(({ tags, ...r }) => ({ ...r, tags_count: tags.length })));
  }
  if (api === "/projects") {
    let list = projects.filter((x) => x.namespace.kind !== "user" || true);
    const min = Number(url.searchParams.get("min_access_level") || 0);
    if (min) list = list.filter((x) => x.permissions.project_access.access_level >= min);
    const s = url.searchParams.get("search");
    if (s) list = list.filter((x) => x.path_with_namespace.includes(s));
    return paginate(res, url, url.searchParams.get("statistics") === "true" ? list : list.map((x) => omit(x, "statistics")));
  }
  if ((m = api.match(/^\/projects\/([^/]+)$/))) {
    const key = decodeURIComponent(m[1]);
    const proj = projects.find((x) => String(x.id) === key || x.path_with_namespace === key);
    if (!proj) return send(res, 404, { message: "404 Project Not Found" });
    const rest = omit(proj, "statistics");
    return send(res, 200, { ...(url.searchParams.get("statistics") === "true" ? proj : rest), container_expiration_policy: { cadence: "1d", enabled: false, keep_n: 10, older_than: "90d", name_regex: ".*", name_regex_keep: null, next_run_at: null } });
  }
  if ((m = api.match(/^\/projects\/(\d+)\/packages$/))) return paginate(res, url, filterPkgs(url, packages.filter((x) => x.project_id == m[1])));
  if ((m = api.match(/^\/projects\/(\d+)\/packages\/(\d+)$/))) {
    const i = packages.findIndex((x) => x.project_id == m[1] && x.id == m[2] && x.status !== "deleted");
    if (i < 0) return send(res, 404, { message: "404 Package Not Found" });
    if (req.method === "DELETE") {
      const proj = projects.find((x) => x.id == m[1]);
      if (proj.permissions.project_access.access_level < 40) return send(res, 403, { message: "403 Forbidden" });
      packages[i].status = "deleted";
      return send(res, 204);
    }
    return send(res, 200, publicPkg(packages[i]));
  }
  if ((m = api.match(/^\/projects\/(\d+)\/packages\/(\d+)\/package_files$/))) {
    const pkg = packages.find((x) => x.id == m[2]);
    return pkg ? paginate(res, url, pkg.files) : send(res, 404, { message: "404" });
  }
  if ((m = api.match(/^\/projects\/(\d+)\/packages\/(\d+)\/package_files\/(\d+)$/)) && req.method === "DELETE") {
    const pkg = packages.find((x) => x.id == m[2]);
    pkg.files = pkg.files.filter((f) => f.id != m[3]);
    return send(res, 204);
  }
  if ((m = api.match(/^\/projects\/(\d+)\/packages\/(\d+)\/pipelines$/))) {
    const pkg = packages.find((x) => x.id == m[2]);
    return paginate(res, url, pkg?.pipelines || []);
  }
  if ((m = api.match(/^\/projects\/(\d+)\/packages\/generic\/([^/]+)\/([^/]+)\/([^/?]+)$/)) && req.method === "PUT") {
    const body = await readBody(req);
    const existing = packages.find((x) => x.project_id == m[1] && x.name === decodeURIComponent(m[2]) && x.version === decodeURIComponent(m[3]) && x.status !== "deleted");
    if (!existing) addPkg(Number(m[1]), "generic", decodeURIComponent(m[2]), decodeURIComponent(m[3]), 0, { manual: true, files: [decodeURIComponent(m[4])] });
    else existing.files.push({ id: Date.now(), package_id: existing.id, file_name: decodeURIComponent(m[4]), size: body.length, created_at: iso(0), file_md5: null, file_sha1: null, file_sha256: crypto.createHash("sha256").update(body).digest("hex") });
    log.push(`  uploaded ${body.length} bytes`);
    return send(res, 201, { message: "201 Created" });
  }
  if ((m = api.match(/^\/projects\/(\d+)\/packages\/helm\/api\/([^/]+)\/charts$/)) && req.method === "POST") {
    const body = await readBody(req);
    addPkg(Number(m[1]), "helm", "uploaded-chart", "0.1.0", 0, { manual: true });
    log.push(`  helm upload ${body.length} bytes`);
    return send(res, 201, { message: "201 Created" });
  }
  if ((m = api.match(/^\/projects\/(\d+)\/registry\/repositories$/))) {
    const list = containerRepos.filter((r) => r.project_id == m[1]).map(({ tags, ...r }) => ({ ...r, tags_count: tags.length }));
    return paginate(res, url, list);
  }
  if ((m = api.match(/^\/registry\/repositories\/(\d+)$/))) {
    const r = containerRepos.find((x) => x.id == m[1]);
    if (!r) return send(res, 404, { message: "404" });
    const { tags, ...rest } = r;
    return send(res, 200, { ...rest, tags_count: tags.length, size: 734003200 });
  }
  if ((m = api.match(/^\/projects\/(\d+)\/registry\/repositories\/(\d+)$/)) && req.method === "DELETE") {
    const i = containerRepos.findIndex((x) => x.id == m[2]);
    containerRepos.splice(i, 1);
    return send(res, 202, {});
  }
  if ((m = api.match(/^\/projects\/(\d+)\/registry\/repositories\/(\d+)\/tags$/))) {
    const r = containerRepos.find((x) => x.id == m[2]);
    if (!r) return send(res, 404, { message: "404" });
    if (req.method === "DELETE") return send(res, 202, {});
    return paginate(res, url, r.tags.map((t) => ({ name: t, path: `${r.path}:${t}`, location: `${r.location}:${t}` })));
  }
  if ((m = api.match(/^\/projects\/(\d+)\/registry\/repositories\/(\d+)\/tags\/([^/]+)$/))) {
    const r = containerRepos.find((x) => x.id == m[2]);
    const t = decodeURIComponent(m[3]);
    if (!r || !r.tags.includes(t)) return send(res, 404, { message: "404 Tag Not Found" });
    if (req.method === "DELETE") { r.tags = r.tags.filter((x) => x !== t); return send(res, 200, {}); }
    return send(res, 200, { name: t, path: `${r.path}:${t}`, location: `${r.location}:${t}`, revision: sha(t), short_revision: sha(t, 9), digest: `sha256:${sha(t + "d")}`, created_at: iso(3), total_size: 98765432 });
  }
  if (/^\/projects\/\d+\/(vulnerabilities|dependencies|vulnerability_findings)$/.test(api)) return send(res, 404, { message: "404 Not Found" });
  if (api === "/personal_access_tokens/self") return send(res, 200, { id: 1, name: "svc", scopes: ["api"], active: true, expires_at: null });

  send(res, 404, { message: `404 mock: ${req.method} ${api}` });
});
server.listen(PORT, "127.0.0.1", () => console.log(`mock gitlab on ${BASE}`));
