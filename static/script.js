// =====================
// INIT VIS NETWORK
// =====================
var nodes = new vis.DataSet([]);
var edges = new vis.DataSet([]);
var container = document.getElementById('network-container');
var data = { nodes: nodes, edges: edges };

// Tắt manipulation UI nổi, dùng sidebar mode
var options = {
  manipulation: { enabled: false },
  interaction: { hover: true, dragNodes: true },
  physics: { enabled: true, stabilization: { iterations: 150 } }
};

var network = new vis.Network(container, data, options);

// Sau khi ổn định xong, tự khóa để khỏi rung
network.once("stabilizationIterationsDone", function () {
  network.setOptions({ physics: false });
});

// =====================
// LOCK / UNLOCK GRAPH
// =====================
function lockGraph() {
  network.setOptions({ physics: false });
}

function unlockGraph() {
  network.setOptions({
    physics: { enabled: true, stabilization: { iterations: 150 } }
  });
  network.once("stabilizationIterationsDone", function () {
    network.setOptions({ physics: false });
  });
}

// =====================
// SIDEBAR DRAWING MODES
// =====================
let currentMode = "move";   // move | add_node | add_edge | edit_edge | delete
let pendingFrom = null;     // dùng khi add_edge

window.setMode = function (mode) {
  currentMode = mode;
  pendingFrom = null;

  if (mode === "add_node") container.style.cursor = "crosshair";
  else if (mode === "add_edge") container.style.cursor = "cell";
  else if (mode === "edit_edge") container.style.cursor = "help";
  else if (mode === "delete") container.style.cursor = "not-allowed";
  else container.style.cursor = "grab";

  resetColor();
};

function getDefaultWeight() {
  return (document.getElementById('defaultWeight')?.value || "1").trim() || "1";
}
function getDefaultCapacity() {
  return (document.getElementById('defaultCapacity')?.value || "1").trim() || "1";
}

network.on("click", function (params) {
  const clickedNode = (params.nodes && params.nodes.length) ? String(params.nodes[0]) : null;
  const clickedEdge = (params.edges && params.edges.length) ? String(params.edges[0]) : null;

  // ADD NODE: click vùng trống để thêm node
  if (currentMode === "add_node") {
    if (!clickedNode && !clickedEdge) {
      let label = prompt("Nhập tên đỉnh:", String(nodes.length + 1));
      if (!label) return;
      label = label.trim();
      if (!label) return;

      if (nodes.get(label)) {
        alert("Đỉnh đã tồn tại!");
        return;
      }
      nodes.add({
        id: label,
        label: label,
        x: params.pointer.canvas.x,
        y: params.pointer.canvas.y
      });
    }
    return;
  }

  // ADD EDGE: click node1 -> click node2
  if (currentMode === "add_edge") {
    if (!clickedNode) return;

    if (pendingFrom === null) {
      pendingFrom = clickedNode;
      nodes.update({ id: pendingFrom, color: { background: "#fde68a", border: "#f59e0b" } });
      return;
    } else {
      const from = pendingFrom;
      const to = clickedNode;
      pendingFrom = null;

      nodes.update({ id: from, color: { background: "#e5e7eb", border: "#9ca3af" } });
      if (from === to) return;

      const isDirected = document.getElementById('isDirected')?.checked || false;
      const wDefault = getDefaultWeight();
      const cDefault = getDefaultCapacity();

      let w = prompt("Nhập trọng số weight:", wDefault);
      if (w === null) return;
      w = String(w).trim() || wDefault;

      let c = prompt("Nhập capacity (MaxFlow):", cDefault);
      if (c === null) return;
      c = String(c).trim() || cDefault;

      const eid = "e" + (edges.length + 1);
      edges.add({
        id: eid,
        from: String(from),
        to: String(to),
        label: String(w),
        capacity: Number(c),
        arrows: isDirected ? "to" : ""
      });
    }
    return;
  }

  // EDIT EDGE: click cạnh
  if (currentMode === "edit_edge") {
    if (!clickedEdge) return;
    const e = edges.get(clickedEdge);

    const wDefault = (e.label || getDefaultWeight());
    const cDefault = (e.capacity != null ? String(e.capacity) : getDefaultCapacity());

    let w = prompt("Sửa weight:", wDefault);
    if (w === null) return;
    w = String(w).trim() || wDefault;

    let c = prompt("Sửa capacity (MaxFlow):", cDefault);
    if (c === null) return;
    c = String(c).trim() || cDefault;

    edges.update({ id: clickedEdge, label: w, capacity: Number(c) });
    return;
  }

  // DELETE node/edge
  if (currentMode === "delete") {
    if (clickedEdge) edges.remove(clickedEdge);
    else if (clickedNode) nodes.remove(clickedNode);
    return;
  }
});

// Directed checkbox => update arrows
const directedCheckbox = document.getElementById("isDirected");
if (directedCheckbox) {
  directedCheckbox.addEventListener("change", function () {
    const isDirected = this.checked;
    edges.forEach(e => edges.update({ id: e.id, arrows: isDirected ? "to" : "" }));
  });
}

// =====================
// SAVE / LOAD JSON
// =====================
function getGraphData() {
  return {
    nodes: nodes.get(),
    edges: edges.get(),
    isDirected: document.getElementById('isDirected')?.checked || false
  };
}

function exportGraph() {
  const g = getGraphData();
  const blob = new Blob([JSON.stringify(g, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importGraphFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    try {
      const g = JSON.parse(reader.result);
      loadGraph(g);
      alert("Import đồ thị thành công!");
    } catch (e) {
      alert("JSON không hợp lệ: " + e);
    }
  };
  reader.readAsText(file);
}

function loadGraph(g) {
  clearGraph();
  document.getElementById('isDirected').checked = !!g.isDirected;

  nodes.add((g.nodes || []).map(n => ({
    id: String(n.id),
    label: String(n.label ?? n.id)
  })));

  edges.add((g.edges || []).map((e, idx) => ({
    id: e.id ? String(e.id) : ("e" + (idx + 1)),
    from: String(e.from),
    to: String(e.to),
    label: String(e.label ?? "1"),
    capacity: (e.capacity != null ? Number(e.capacity) : Number(getDefaultCapacity())),
    arrows: (g.isDirected ? "to" : "")
  })));

  resetColor();
}

function clearGraph() {
  nodes.clear();
  edges.clear();
  resetColor();
}

// =====================
// ANIMATION HELPERS
// =====================
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function getSpeed() {
  const v = document.getElementById('speedMs');
  const ms = v ? parseInt(v.value || "450", 10) : 450;
  return Number.isFinite(ms) ? ms : 450;
}

function resetColor() {
  nodes.forEach(n => nodes.update({ id: n.id, color: { background: '#e5e7eb', border: '#9ca3af' } }));
  edges.forEach(e => edges.update({ id: e.id, color: { color: '#848484' }, width: 2 }));
  const out = document.getElementById('outputArea');
  if (out) out.value = "";
}

function findEdgeId(u, v) {
  const directed = document.getElementById('isDirected')?.checked || false;
  const all = edges.get();
  const e = all.find(e =>
    (String(e.from) === String(u) && String(e.to) === String(v)) ||
    (!directed && String(e.from) === String(v) && String(e.to) === String(u))
  );
  return e ? e.id : null;
}

function colorNode(id, color) {
  nodes.update({ id: String(id), color: { background: color, border: color } });
}

function colorEdge(edgeId, color, width = 4) {
  if (!edgeId) return;
  edges.update({ id: edgeId, color: { color: color, highlight: color }, width });
}

async function animateSteps(steps) {
  resetColor();
  const speed = getSpeed();
  for (const s of steps) {
    if (s.type === 'node') colorNode(s.id, '#ffff00');
    else if (s.type === 'edge') colorEdge(s.id, '#93c5fd', 4);
    else if (s.type === 'final_node') colorNode(s.id, '#ff0000');
    else if (s.type === 'final_edge') colorEdge(s.id, 'red', 5);
    else if (s.type === 'good_edge') colorEdge(s.id, '#22c55e', 5);
    else if (s.type === 'msg') {
      const out = document.getElementById('outputArea');
      if (out) out.value += s.text + "\n";
    }
    await sleep(speed);
  }
}

// =====================
// BACKEND CALLS
// =====================
async function runShortestPath() {
  resetColor();
  const source = document.getElementById('sourceNode').value.trim();
  const target = document.getElementById('targetNode').value.trim();

  const response = await fetch('/api/shortest_path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData(), source, target })
  });
  const result = await response.json();

  if (result.status === 'success') {
    alert("Độ dài đường đi: " + result.length);
    const path = result.path || [];
    const steps = [{ type: 'msg', text: `Shortest path length = ${result.length}` }];
    for (let i = 0; i < path.length; i++) {
      steps.push({ type: 'final_node', id: path[i] });
      if (i < path.length - 1) {
        const eid = findEdgeId(path[i], path[i + 1]);
        steps.push({ type: 'final_edge', id: eid });
      }
    }
    await animateSteps(steps);
  } else {
    alert(result.message || "Không tìm được đường đi.");
  }
}

async function runTraversal(method) {
  resetColor();
  const source = document.getElementById('sourceNode').value.trim();

  const response = await fetch('/api/traversal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData(), source, method })
  });
  const result = await response.json();

  if (result.status === 'success') {
    const steps = [{ type: 'msg', text: `${method.toUpperCase()} from ${source}` }];
    if (result.path_nodes && result.path_nodes.length > 0) {
      steps.push({ type: 'node', id: result.path_nodes[0] });
    }
    for (const [u, v] of (result.path_edges || [])) {
      const eid = findEdgeId(u, v);
      steps.push({ type: 'edge', id: eid });
      steps.push({ type: 'node', id: v });
    }
    await animateSteps(steps);
  } else {
    alert(result.message || "Traversal failed.");
  }
}

async function checkBipartite() {
  const response = await fetch('/api/check_bipartite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData() })
  });
  const result = await response.json();

  if (result.is_bipartite) {
    alert("ĐÂY LÀ ĐỒ THỊ 2 PHÍA!");
    const s1 = result.sets?.set1 || [];
    const s2 = result.sets?.set2 || [];
    s1.forEach(id => nodes.update({ id: id, color: { background: '#AABBCC', border: '#64748b' } }));
    s2.forEach(id => nodes.update({ id: id, color: { background: '#FFCCAA', border: '#fb7185' } }));
  } else {
    alert("Không phải đồ thị 2 phía.");
  }
}

async function convertRepresentation() {
  const response = await fetch('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData() })
  });
  const result = await response.json();

  let text = "--- MA TRẬN KỀ ---\n";
  text += "Nodes: " + result.nodes.join(", ") + "\n";
  result.adj_matrix.forEach(row => { text += JSON.stringify(row) + "\n"; });

  text += "\n--- DANH SÁCH KỀ ---\n";
  for (const [key, value] of Object.entries(result.adj_list)) {
    text += `${key}: ${JSON.stringify(value)}\n`;
  }

  text += "\n--- DANH SÁCH CẠNH ---\n";
  (result.edge_list || []).forEach(edge => {
    text += `(${edge[0]}, ${edge[1]}) - w:${edge[2]}\n`;
  });

  document.getElementById('outputArea').value = text;
}

async function buildFromRepresentation() {
  const mode = document.getElementById('repMode').value;
  const txt = document.getElementById('repInput').value.trim();
  if (!txt) return alert("Hãy dán JSON biểu diễn vào ô trước!");

  let payload;
  try { payload = JSON.parse(txt); }
  catch (e) { return alert("JSON không hợp lệ: " + e); }

  payload.mode = mode;
  payload.isDirected = document.getElementById('isDirected').checked;

  const response = await fetch('/api/build_from_rep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (result.status === 'success') {
    loadGraph(result.graph);
    alert("Build đồ thị thành công!");
  } else {
    alert(result.message || "Build thất bại.");
  }
}

async function runMST(algo) {
  resetColor();
  const response = await fetch('/api/mst', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData(), algorithm: algo })
  });
  const result = await response.json();

  if (result.status === 'success') {
    const mstEdges = result.edges || [];
    const steps = [{ type: 'msg', text: `MST (${algo}) edges=${mstEdges.length}, total=${result.total}` }];
    mstEdges.forEach(([u, v]) => {
      const eid = findEdgeId(u, v);
      steps.push({ type: 'good_edge', id: eid });
    });
    await animateSteps(steps);
  } else {
    alert(result.message || "MST failed.");
  }
}

async function runMaxFlow() {
  resetColor();
  const source = document.getElementById('sourceNode').value.trim();
  const target = document.getElementById('targetNode').value.trim();

  const response = await fetch('/api/maxflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData(), source, target })
  });
  const result = await response.json();

  if (result.status === 'success') {
    const steps = [{ type: 'msg', text: `MaxFlow = ${result.maxflow}` }];
    (result.flow_edges || []).forEach(([u, v, f, cap]) => {
      if (f > 0) {
        const eid = findEdgeId(u, v);
        steps.push({ type: 'good_edge', id: eid });
        steps.push({ type: 'msg', text: `${u}->${v}: flow=${f}/${cap}` });
      }
    });
    await animateSteps(steps);
    alert("MaxFlow = " + result.maxflow);
  } else {
    alert(result.message || "MaxFlow failed.");
  }
}

async function runEuler(which) {
  resetColor();
  const start = document.getElementById('sourceNode').value.trim();
  const endpoint = (which === 'fleury') ? '/api/euler_fleury' : '/api/euler_hierholzer';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: getGraphData(), start })
  });
  const result = await response.json();

  if (result.status !== 'success') return alert(result.message || "Euler failed.");

  const steps = [{ type: 'msg', text: `${which.toUpperCase()} start=${result.start}, odd=${JSON.stringify(result.odd)}` }];
  const listEdges = (which === 'fleury') ? (result.trail_edges || []) : (result.circuit_edges || []);

  if (listEdges.length === 0) {
    steps.push({ type: 'msg', text: 'Không có cạnh để duyệt.' });
    return animateSteps(steps);
  }

  steps.push({ type: 'final_node', id: listEdges[0][0] });
  for (const [u, v] of listEdges) {
    const eid = findEdgeId(u, v);
    steps.push({ type: 'final_edge', id: eid });
    steps.push({ type: 'final_node', id: v });
  }
  await animateSteps(steps);
}
