# app.py
from flask import Flask, render_template, request, jsonify
import os
# ...

app = Flask(
    __name__,
    template_folder='.',   # tìm index.html ở thư mục hiện tại 
    static_folder='.',     # phục vụ script.js từ thư mục hiện tại
    static_url_path=''     
)


# -----------------------------
# Helpers
# -----------------------------
def build_graph_from_json(data):
    """
    data = { nodes:[{id,label}], edges:[{id,from,to,label}], isDirected:bool }
    label của edge được hiểu là weight (float). (MaxFlow sẽ dùng capacity riêng.)
    """
    directed = bool(data.get('isDirected', False))
    G = nx.DiGraph() if directed else nx.Graph()

    for node in data.get('nodes', []):
        nid = str(node.get('id'))
        G.add_node(nid, label=str(node.get('label', nid)))

    for edge in data.get('edges', []):
        u = str(edge.get('from'))
        v = str(edge.get('to'))
        w = float(edge.get('label', 1) or 1)
        G.add_edge(u, v, weight=w, id=edge.get('id'))
    return G


def build_capacity_digraph(data):
    """
    Tạo DiGraph cho maxflow:
    - luôn coi là có hướng
    - capacity lấy từ edge['capacity'] nếu có, nếu không lấy từ label
    """
    G = nx.DiGraph()
    for node in data.get('nodes', []):
        nid = str(node.get('id'))
        G.add_node(nid)

    for edge in data.get('edges', []):
        u = str(edge.get('from'))
        v = str(edge.get('to'))
        cap = edge.get('capacity', None)
        if cap is None:
            cap = edge.get('label', 0)
        cap = float(cap or 0)
        if cap < 0:
            cap = 0.0
        if G.has_edge(u, v):
            G[u][v]['capacity'] += cap
        else:
            G.add_edge(u, v, capacity=cap, id=edge.get('id'))
    return G


@app.route('/')
def index():
    return render_template('index.html')


# -----------------------------
# 3) Shortest path (Dijkstra)
# -----------------------------
@app.route('/api/shortest_path', methods=['POST'])
def get_shortest_path():
    data = request.json
    G = build_graph_from_json(data['graph'])
    source = str(data['source'])
    target = str(data['target'])

    try:
        path = nx.dijkstra_path(G, source, target, weight='weight')
        length = nx.dijkstra_path_length(G, source, target, weight='weight')
        return jsonify({'status': 'success', 'path': path, 'length': length})
    except nx.NetworkXNoPath:
        return jsonify({'status': 'error', 'message': 'Không có đường đi'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


# -----------------------------
# 4) Traversal BFS/DFS
# -----------------------------
@app.route('/api/traversal', methods=['POST'])
def traversal():
    data = request.json
    G = build_graph_from_json(data['graph'])
    start_node = str(data['source'])
    method = str(data.get('method', 'bfs')).lower()

    try:
        if start_node not in G:
            return jsonify({'status': 'error', 'message': 'Đỉnh nguồn không tồn tại trong đồ thị'})

        if method == 'bfs':
            edges = list(nx.bfs_edges(G, source=start_node))
        else:
            edges = list(nx.dfs_edges(G, source=start_node))

        nodes_order = [start_node] + [v for u, v in edges]
        return jsonify({'status': 'success', 'path_nodes': nodes_order, 'path_edges': edges})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


# -----------------------------
# 5) Bipartite
# -----------------------------
@app.route('/api/check_bipartite', methods=['POST'])
def check_bipartite():
    data = request.json
    G = build_graph_from_json(data['graph'])
    Gu = G.to_undirected()

    is_bip = nx.is_bipartite(Gu)
    sets = {}
    if is_bip:
        try:
            s1, s2 = nx.bipartite.sets(Gu)
            sets = {'set1': list(s1), 'set2': list(s2)}
        except Exception:
            sets = {}

    return jsonify({'is_bipartite': is_bip, 'sets': sets})


# -----------------------------
# 6) Convert representations
# -----------------------------
@app.route('/api/convert', methods=['POST'])
def convert_representation():
    data = request.json
    G = build_graph_from_json(data['graph'])

    nodes = sorted(list(G.nodes()))
    adj_matrix = nx.to_numpy_array(G, nodelist=nodes)
    adj_list = nx.to_dict_of_lists(G)
    edge_list = list(G.edges(data='weight'))  # (u,v,w)

    return jsonify({
        'nodes': nodes,
        'adj_matrix': adj_matrix.tolist(),
        'adj_list': adj_list,
        'edge_list': edge_list
    })


# -----------------------------
# 6b) Build graph from representation (matrix/adjlist/edgelist)
# -----------------------------
@app.route('/api/build_from_rep', methods=['POST'])
def build_from_rep():
    data = request.json
    mode = str(data.get('mode', '')).lower()
    directed = bool(data.get('isDirected', False))

    try:
        if mode == 'matrix':
            nodes = [str(x) for x in data.get('nodes', [])]
            M = data.get('adj_matrix', [])
            G = nx.DiGraph() if directed else nx.Graph()
            G.add_nodes_from(nodes)
            for i in range(len(nodes)):
                for j in range(len(nodes)):
                    if int(M[i][j]) != 0:
                        if not directed and j < i:
                            continue
                        G.add_edge(nodes[i], nodes[j], weight=1.0)

        elif mode == 'adjlist':
            adj = data.get('adj_list', {})
            G = nx.DiGraph() if directed else nx.Graph()
            for u, nbrs in adj.items():
                G.add_node(str(u))
                for v in nbrs:
                    G.add_node(str(v))
                    G.add_edge(str(u), str(v), weight=1.0)

        elif mode == 'edgelist':
            nodes = [str(x) for x in data.get('nodes', [])]
            el = data.get('edge_list', [])  # [[u,v,w],...]
            G = nx.DiGraph() if directed else nx.Graph()
            G.add_nodes_from(nodes)
            for e in el:
                u, v = str(e[0]), str(e[1])
                w = float(e[2]) if len(e) >= 3 else 1.0
                G.add_edge(u, v, weight=w)

        else:
            return jsonify({'status': 'error', 'message': 'mode không hợp lệ'})

        out_nodes = [{'id': str(n), 'label': str(n)} for n in G.nodes()]
        out_edges = []
        k = 1
        for (u, v, d) in G.edges(data=True):
            out_edges.append({'id': f'e{k}', 'from': str(u), 'to': str(v), 'label': str(d.get('weight', 1.0))})
            k += 1

        return jsonify({'status': 'success', 'graph': {'nodes': out_nodes, 'edges': out_edges, 'isDirected': directed}})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


# -----------------------------
# 7.1/7.2) MST (Prim/Kruskal)
# -----------------------------
@app.route('/api/mst', methods=['POST'])
def get_mst():
    data = request.json
    G = build_graph_from_json(data['graph'])
    algo = str(data.get('algorithm', 'kruskal')).lower()
    G_undirected = G.to_undirected()

    try:
        if algo == 'prim':
            mst = nx.minimum_spanning_tree(G_undirected, algorithm='prim', weight='weight')
        else:
            mst = nx.minimum_spanning_tree(G_undirected, algorithm='kruskal', weight='weight')

        edges_uv = [[u, v] for (u, v) in mst.edges()]
        total = float(sum(G_undirected[u][v].get('weight', 1.0) for u, v in mst.edges()))
        return jsonify({'status': 'success', 'edges': edges_uv, 'total': total})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


# -----------------------------
# 7.3) MaxFlow (Ford-Fulkerson via Edmonds-Karp)
# -----------------------------
@app.route('/api/maxflow', methods=['POST'])
def maxflow():
    data = request.json
    s = str(data.get('source', ''))
    t = str(data.get('target', ''))
    G = build_capacity_digraph(data['graph'])

    if s not in G or t not in G:
        return jsonify({'status': 'error', 'message': 's/t không tồn tại'})

    try:
        flow_value, flow_dict = nx.maximum_flow(
            G, s, t,
            flow_func=nx.algorithms.flow.edmonds_karp,
            capacity='capacity'
        )

        edges = []
        for u in flow_dict:
            for v, f in flow_dict[u].items():
                if G.has_edge(u, v):
                    cap = float(G[u][v].get('capacity', 0.0))
                    edges.append([u, v, float(f), cap])

        return jsonify({'status': 'success', 'maxflow': float(flow_value), 'flow_edges': edges})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


# -----------------------------
# 7.4/7.5) Euler (Fleury, Hierholzer) - undirected
# -----------------------------
def _euler_ok_undirected(Gu: nx.Graph):
    non_iso = [n for n in Gu.nodes() if Gu.degree(n) > 0]
    if non_iso:
        comp = nx.node_connected_component(Gu, non_iso[0])
        if any(n not in comp for n in non_iso):
            return False, []
    odd = [n for n in Gu.nodes() if Gu.degree(n) % 2 == 1]
    return (len(odd) in (0, 2) and len(non_iso) > 0), odd


@app.route('/api/euler_fleury', methods=['POST'])
def euler_fleury():
    data = request.json
    start = str(data.get('start', ''))
    G = build_graph_from_json(data['graph'])
    Gu = G.to_undirected()

    ok, odd = _euler_ok_undirected(Gu)
    if not ok:
        return jsonify({'status': 'error', 'message': f'Không có Euler trail/cycle. Odd={odd}'})

    if start not in Gu.nodes():
        start = odd[0] if len(odd) == 2 else (next(iter(Gu.nodes())) if len(Gu.nodes()) else '')
    if len(odd) == 2 and start not in odd:
        start = odd[0]

    H = Gu.copy()
    trail_edges = []
    cur = start

    def is_bridge(a, b):
        if H.number_of_edges() == 1:
            return False
        reachable_before = set(nx.dfs_preorder_nodes(H, a))
        attr = dict(H[a][b])
        H.remove_edge(a, b)
        reachable_after = set(nx.dfs_preorder_nodes(H, a)) if a in H.nodes() else set()
        H.add_edge(a, b, **attr)
        return len(reachable_after) < len(reachable_before)

    while H.degree(cur) > 0:
        nbrs = list(H.neighbors(cur))
        chosen = None
        for v in nbrs:
            if len(nbrs) == 1 or not is_bridge(cur, v):
                chosen = v
                break
        if chosen is None:
            chosen = nbrs[0]
        trail_edges.append([cur, chosen])
        H.remove_edge(cur, chosen)
        cur = chosen

    return jsonify({'status': 'success', 'start': start, 'odd': odd, 'trail_edges': trail_edges})


@app.route('/api/euler_hierholzer', methods=['POST'])
def euler_hierholzer():
    data = request.json
    start = str(data.get('start', ''))
    G = build_graph_from_json(data['graph'])
    Gu = G.to_undirected()

    ok, odd = _euler_ok_undirected(Gu)
    if not ok:
        return jsonify({'status': 'error', 'message': f'Không có Euler trail/cycle. Odd={odd}'})

    if start not in Gu.nodes():
        start = odd[0] if len(odd) == 2 else (next(iter(Gu.nodes())) if len(Gu.nodes()) else '')
    if len(odd) == 2 and start not in odd:
        start = odd[0]

    H = Gu.copy()
    stack = [start]
    circuit = []

    while stack:
        v = stack[-1]
        if H.degree(v) == 0:
            circuit.append(v)
            stack.pop()
        else:
            u = next(iter(H.neighbors(v)))
            H.remove_edge(v, u)
            stack.append(u)

    edges = []
    for i in range(len(circuit) - 1):
        edges.append([circuit[i], circuit[i+1]])

    return jsonify({'status': 'success', 'start': start, 'odd': odd, 'circuit_edges': edges})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
