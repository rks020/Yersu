'use strict';
// ============================================================
// HexGrid — Hex ızgara matematik ve veri yapıları
// Pointy-top hex, axial koordinat sistemi (q, r)
// ============================================================

class HexGrid {
    constructor(radius, hexSizePx) {
        this.radius   = radius;
        this.hexSize  = hexSizePx;
        this.hexes    = new Map(); // id → hex
        this.nodes    = new Map(); // id → node (düğüm / vertex)
        this.edges    = new Map(); // id → edge (patika / edge)
        this._generate();
    }

    // ── Koordinat dönüşümleri ──────────────────────────────────

    hexToPixel(q, r) {
        const s = this.hexSize;
        return {
            x: s * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
            y: s * (3 / 2 * r)
        };
    }

    pixelToHex(px, py) {
        const s = this.hexSize;
        const q = (px * Math.sqrt(3) / 3 - py / 3) / s;
        const r = py * 2 / 3 / s;
        return this._roundHex(q, r);
    }

    _roundHex(q, r) {
        const s = -q - r;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs;
        else if (dr > ds)       rr = -rq - rs;
        return { q: rq, r: rr };
    }

    // ── Vertex (köşe / node) pozisyonları ────────────────────────

    getVertexPositions(q, r) {
        const { x: cx, y: cy } = this.hexToPixel(q, r);
        const s = this.hexSize;
        const verts = [];
        for (let i = 0; i < 6; i++) {
            // Pointy-top: başlangıç açısı -30° (top-right), saat yönünde 60° artar
            const angle = Math.PI / 180 * (60 * i - 30);
            verts.push({
                x: cx + s * Math.cos(angle),
                y: cy + s * Math.sin(angle)
            });
        }
        return verts;
    }

    // ── ID üretimi ────────────────────────────────────────────────

    hexId(q, r)         { return `${q}:${r}`; }

    nodeId(x, y) {
        // Floating-point güvenliği: 1 ondalık hassasiyetle yuvarla
        const rx = Math.round(x * 10) / 10;
        const ry = Math.round(y * 10) / 10;
        return `N${rx},${ry}`;
    }

    edgeId(nid1, nid2) {
        return [nid1, nid2].sort().join('|');
    }

    // ── Ana ızgara üretimi ────────────────────────────────────────

    _generate() {
        const R = this.radius;

        for (let q = -R; q <= R; q++) {
            for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
                const id      = this.hexId(q, r);
                const verts   = this.getVertexPositions(q, r);
                const nodeIds = verts.map(v => this.nodeId(v.x, v.y));
                const edgeIds = [];

                // Vertex (node) kaydı
                nodeIds.forEach((nid, i) => {
                    if (!this.nodes.has(nid)) {
                        this.nodes.set(nid, {
                            id:    nid,
                            x:     verts[i].x,
                            y:     verts[i].y,
                            hexes: [],
                            edges: [],
                        });
                    }
                    const node = this.nodes.get(nid);
                    if (!node.hexes.includes(id)) node.hexes.push(id);
                });

                // Edge (patika) kaydı
                for (let i = 0; i < 6; i++) {
                    const n1  = nodeIds[i];
                    const n2  = nodeIds[(i + 1) % 6];
                    const eid = this.edgeId(n1, n2);
                    edgeIds.push(eid);

                    if (!this.edges.has(eid)) {
                        this.edges.set(eid, {
                            id:    eid,
                            node1: n1,
                            node2: n2,
                            hexes: [],
                            road:  null,  // playerId
                        });
                        this.nodes.get(n1).edges.push(eid);
                        this.nodes.get(n2).edges.push(eid);
                    }
                    const edge = this.edges.get(eid);
                    if (!edge.hexes.includes(id)) edge.hexes.push(id);
                }

                const { x: cx, y: cy } = this.hexToPixel(q, r);
                this.hexes.set(id, {
                    id,
                    q, r,
                    x: cx, y: cy, // Center point
                    biome:      null,
                    resources:  [],   // üretilen 3 kaynak
                    number:     null, // 2-12
                    nodeIds,
                    edgeIds,
                    center:     { x: cx, y: cy },
                    army:       null,   // { playerId, units: [] }
                    settlement: null,   // { playerId, type:'koy'|'sehir'|'metropol', buildings: Set }
                    adjacentHexes: []  // Will be filled after loop
                });
            }
        }

        // Hex komşulukları
        this.hexes.forEach(h => {
            h.adjacentHexes = this.getAdjacentHexIds(h.id);
        });

        // Node komşuluk haritası (adjacent nodes via shared edges)
        this.nodes.forEach(node => {
            node.adjacentNodes = node.edges.map(eid => {
                const e = this.edges.get(eid);
                return e.node1 === node.id ? e.node2 : e.node1;
            });
            // Yeni: Komşu yerleşimleri bulma kolaylığı için
            node.adjacentSettlements = []; 
        });
    }

    // Harita oluşturulduktan sonra komşu yerleşimleri (node bazlı) çekmek için yardımcı
    recalcAdjacentSettlements() {
        this.nodes.forEach(node => {
            node.adjacentSettlements = node.adjacentNodes.filter(nid => {
                const adj = this.nodes.get(nid);
                return adj && adj.settlement;
            });
        });
    }

    // ── Sorgu yardımcıları ────────────────────────────────────────

    getHex(q, r)    { return this.hexes.get(this.hexId(q, r)); }
    getNode(id)     { return this.nodes.get(id); }
    getEdge(id)     { return this.edges.get(id); }

    hexById(id)     { return this.hexes.get(id); }

    getHexNodes(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return [];
        return h.nodeIds.map(nid => this.nodes.get(nid)).filter(Boolean);
    }

    getHexEdges(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return [];
        return h.edgeIds.map(eid => this.edges.get(eid)).filter(Boolean);
    }

    getAdjacentHexes(q, r) {
        const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
        return dirs
            .map(([dq, dr]) => this.getHex(q + dq, r + dr))
            .filter(Boolean);
    }

    getAdjacentHexIds(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return [];
        return this.getAdjacentHexes(h.q, h.r).map(hx => hx.id);
    }

    // Düğüme kaç node uzaklıkta? (BFS)
    nodeDistance(startId, endId) {
        const visited = new Set([startId]);
        const queue   = [{ id: startId, dist: 0 }];
        while (queue.length) {
            const { id, dist } = queue.shift();
            if (id === endId) return dist;
            const node = this.nodes.get(id);
            if (!node) continue;
            for (const nid of node.adjacentNodes) {
                if (!visited.has(nid)) {
                    visited.add(nid);
                    queue.push({ id: nid, dist: dist + 1 });
                }
            }
        }
        return Infinity;
    }

    // BFS ile belirli mesafe içindeki tüm node'lar
    getNodesInRange(startId, maxDist) {
        const visited = new Map([[startId, 0]]);
        const queue   = [{ id: startId, dist: 0 }];
        const result  = [];
        while (queue.length) {
            const { id, dist } = queue.shift();
            result.push({ id, dist });
            if (dist >= maxDist) continue;
            const node = this.nodes.get(id);
            if (!node) continue;
            for (const nid of node.adjacentNodes) {
                if (!visited.has(nid)) {
                    visited.set(nid, dist + 1);
                    queue.push({ id: nid, dist: dist + 1 });
                }
            }
        }
        return result;
    }

    // Oyuncunun yol ağına bağlı düğümleri bul
    getPlayerConnectedNodes(playerId) {
        const startNodes = new Set();

        // Oyuncunun tüm settlement'larının (nodlardaki) düğümlerini başlangıç al
        this.nodes.forEach(node => {
            if (node.settlement && node.settlement.playerId === playerId) {
                startNodes.add(node.id);
            }
        });
        // Oyuncunun yollarının başlangıç node'larını da ekle
        this.edges.forEach(edge => {
            if (edge.road === playerId) {
                startNodes.add(edge.node1);
                startNodes.add(edge.node2);
            }
        });

        // BFS sadece oyuncunun yolları üzerinden
        const visited = new Set([...startNodes]);
        const queue   = [...startNodes];
        while (queue.length) {
            const nid  = queue.shift();
            const node = this.nodes.get(nid);
            if (!node) continue;
            for (const eid of node.edges) {
                const edge = this.edges.get(eid);
                if (edge && edge.road === playerId) {
                    const next = edge.node1 === nid ? edge.node2 : edge.node1;
                    if (!visited.has(next)) {
                        visited.add(next);
                        queue.push(next);
                    }
                }
            }
        }
        return visited;
    }

    // Nodda bağlantılı oyuncunun yolu var mı?
    playerConnectedToNode(playerId, nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        return node.edges.some(eid => {
            const e = this.edges.get(eid);
            return e && e.road === playerId;
        });
    }

    // Nodun bitişiğindeki bir nodda yerleşim var mı? (1 Nod mesafe kuralı - Catan)
    nodeHasAdjacentSettlement(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        return node.adjacentNodes.some(adjId => {
            const adj = this.nodes.get(adjId);
            return adj && adj.settlement !== null;
        });
    }

    // Hex kurmaya uygun mu?
    hexIsSettlable(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return false;
        const bInfo = BIOME_INFO[h.biome];
        return bInfo && bInfo.canSettle;
    }

    // Komşu hex'lerde yerleşim var mı? (En az 1 hex boşluk kuralı için)
    hexHasAdjacentSettlement(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return false;
        return h.adjacentHexes.some(ahid => {
            const adj = this.hexes.get(ahid);
            return adj && adj.settlement !== null;
        });
    }

    // Oyuncunun yol kurulabilecek edge'lerini döndür
    getBuildableRoadEdges(playerId) {
        const connected = this.getPlayerConnectedNodes(playerId);
        const result    = [];
        this.edges.forEach((edge, eid) => {
            if (edge.road !== null) return;
            // Edge'in herhangi bir node'u bağlı ağda mı?
            if (connected.has(edge.node1) || connected.has(edge.node2)) {
                result.push(eid);
            }
        });
        return result;
    }

    // Oyuncunun hex'e bağlantısı var mı? (Herhangi bir kenarında yolu var mı?)
    playerConnectedToHex(playerId, hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return false;
        // Kenarlarında oyuncunun yolu var mı?
        return h.edgeIds.some(eid => this.edges.get(eid).road === playerId);
    }

    // Oyuncunun köy kurabileceği hex'leri döndür
    getBuildableSettlementHexes(playerId, isSetup = false) {
        const result = [];
        this.hexes.forEach((hex, hid) => {
            if (hex.settlement !== null) return;
            if (!this.hexIsSettlable(hid)) return;
            if (this.hexHasAdjacentSettlement(hid)) return;
            
            // Setup aşamasında serbest yerleşim (kurallar dahilinde), normal oyunda ise yola bağlı olmak zorunlu
            if (isSetup || this.playerConnectedToHex(playerId, hid)) {
                result.push(hid);
            }
        });
        return result;
    }

    // Köşe hexleri döndür (başlangıç spawn konumları)
    getCornerHexes() {
        const R = this.radius;
        return [
            this.hexId(R, -R),
            this.hexId(R, 0),
            this.hexId(0, R),
            this.hexId(-R, R),
            this.hexId(-R, 0),
            this.hexId(0, -R),
        ].filter(hid => this.hexes.has(hid));
    }

    // Oyuncunun en uzun yolunu hesapla (Kervansaray VP için)
    getLongestRoad(playerId) {
        // Oyuncuya ait edge'leri topla
        const playerEdges = new Set();
        this.edges.forEach((e, eid) => { if (e.road === playerId) playerEdges.add(eid); });
        if (playerEdges.size === 0) return 0;

        let maxLen = 0;
        // Her edge'den DFS ile en uzun yolu bul
        playerEdges.forEach(startEdge => {
            const visited = new Set();
            const dfs = (eid) => {
                if (visited.has(eid)) return 0;
                visited.add(eid);
                const edge = this.edges.get(eid);
                let best = 1;
                [edge.node1, edge.node2].forEach(nid => {
                    const node = this.nodes.get(nid);
                    if (!node) return;
                    node.edges.forEach(nextEid => {
                        if (playerEdges.has(nextEid) && !visited.has(nextEid)) {
                            best = Math.max(best, 1 + dfs(nextEid));
                        }
                    });
                });
                visited.delete(eid);
                return best;
            };
            maxLen = Math.max(maxLen, dfs(startEdge));
        });
        return maxLen;
    }

    // Pixel koordinatlardan en yakın hex'i bul
    pixelToNearestHex(px, py) {
        const { q, r } = this.pixelToHex(px, py);
        return this.getHex(q, r);
    }

    // Pixel koordinatlardan en yakın node'u bul (threshold içinde)
    pixelToNearestNode(px, py, threshold = 20) {
        let best = null, bestDist = threshold;
        this.nodes.forEach(node => {
            const d = Math.hypot(node.x - px, node.y - py);
            if (d < bestDist) { bestDist = d; best = node; }
        });
        return best;
    }

    // Pixel koordinatlardan en yakın edge'i bul (threshold içinde)
    pixelToNearestEdge(px, py, threshold = 18) {
        let best = null, bestDist = threshold;
        this.edges.forEach(edge => {
            const n1 = this.nodes.get(edge.node1);
            const n2 = this.nodes.get(edge.node2);
            if (!n1 || !n2) return;
            const mx = (n1.x + n2.x) / 2;
            const my = (n1.y + n2.y) / 2;
            const d  = Math.hypot(mx - px, my - py);
            if (d < bestDist) { bestDist = d; best = edge; }
        });
        return best;
    }
}
