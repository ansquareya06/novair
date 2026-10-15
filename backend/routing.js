// Dijkstra's shortest path over the district road graph (predefined routes, no live GPS).
// edges: [[fromId, toId, km], ...]  (roads are two-way)
function dijkstra(edges, src) {
  const graph = {};
  for (const [a, b, w] of edges) { (graph[a] ||= []).push([b, w]); (graph[b] ||= []).push([a, w]); }
  const dist = { [src]: 0 }, prev = {}, done = new Set();
  for (;;) {
    let u = null;
    for (const k of Object.keys(dist)) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) break;
    done.add(u);
    for (const [v, w] of graph[u] || []) if (dist[u] + w < (dist[v] ?? Infinity)) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  return { dist, prev };
}
// node ids from src to dst
function pathTo(prev, src, dst) {
  const p = [String(dst)];
  while (p[p.length - 1] !== String(src)) p.push(prev[p[p.length - 1]]);
  return p.reverse().map(Number);
}
module.exports = { dijkstra, pathTo };
