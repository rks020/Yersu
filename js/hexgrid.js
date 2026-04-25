'use strict';
// ============================================================
// HexGrid — Harita geometrisini ve nesne ilişkilerini yönetir
// Hexler, Edge'ler (Kenarlar) ve Node'lar (Köşeler)
// ============================================================

class HexGrid {
    constructor(size = 50) {
        this.hexSize = size;
        this.hexes = new Map();
        this.nodes = new Map();
        this.edges = new Map();
    }

    // ── Grid Üretimi ─────────────────────────────────────────────

    _generate(radius = 3) {
        this.hexes.clear();
        this.nodes.clear();
        this.edges.clear();

        for (let q = -radius; q <= radius; q++) {
            const r1 = Math.max(-radius, -q - radius);
            const r2 = Math.min(radius, -q + radius);
            for (let r = r1; r <= r2; r++) {
                const id = `${q},${r}`;
                const center = this.hexToPixel(q, r);
                const hex = {
                    id, q, r,
                    center,
                    x: center.x,
                    y: center.y,
                    biome: 'ova',
                    number: 0,
                    resources: [],
                    settlement: null, // { type: 'koy', playerId, buildings: Set }
                    army: null,       // Eski hex-based ordu (artık kullanılmıyor, node'lara taşındı)
                    nodeIds: [],
                    edgeIds: [],
                    adjacentHexes: []
                };

                // Node'ları ve Edge'leri belirle
                const verts = this.getVertexPositions(q, r);
                for (let i = 0; i < 6; i++) {
                    // Node
                    const v = verts[i];
                    const nid = `${Math.round(v.x)},${Math.round(v.y)}`;
                    if (!this.nodes.has(nid)) {
                        this.nodes.set(nid, {
                            id:    nid,
                            x:     verts[i].x,
                            y:     verts[i].y,
                            hexes: [],
                            edges: [],
                            adjacentNodes: [],
                            army:  null, // { playerId, units: [] }
                        });
                    }
                    const node = this.nodes.get(nid);
                    if (!node.hexes.includes(id)) node.hexes.push(id);
                    hex.nodeIds.push(nid);

                    // Edge (Kenar)
                    const v2 = verts[(i + 1) % 6];
                    const nid2 = `${Math.round(v2.x)},${Math.round(v2.y)}`;
                    const eid = [nid, nid2].sort().join('--');
                    if (!this.edges.has(eid)) {
                        this.edges.set(eid, {
                            id:    eid,
                            node1: nid,
                            node2: nid2,
                            hexes: [],
                            road:  null // playerId
                        });
                        // Node-Node komşuluğu
                        node.adjacentNodes.push(nid2);
                    }
                    const edge = this.edges.get(eid);
                    if (!edge.hexes.includes(id)) edge.hexes.push(id);
                    hex.edgeIds.push(eid);
                }
                this.hexes.set(id, hex);
            }
        }

        // Komşu hex'leri bağla
        this.hexes.forEach(h => {
            const neighbors = [
                [1, 0], [1, -1], [0, -1],
                [-1, 0], [-1, 1], [0, 1]
            ];
            neighbors.forEach(([dq, dr]) => {
                const neighbor = this.getHex(h.q + dq, h.r + dr);
                if (neighbor) h.adjacentHexes.push(neighbor.id);
            });
        });

        // Kenarları düğmelere bağla
        this.edges.forEach(e => {
            this.nodes.get(e.node1).edges.push(e.id);
            this.nodes.get(e.node2).edges.push(e.id);
            // Düğümlerin komşu düğümlerini karşılıklı olarak güncelle (eksik kalmışsa)
            const n1 = this.nodes.get(e.node1);
            const n2 = this.nodes.get(e.node2);
            if (!n1.adjacentNodes.includes(e.node2)) n1.adjacentNodes.push(e.node2);
            if (!n2.adjacentNodes.includes(e.node1)) n2.adjacentNodes.push(e.node1);
        });
    }

    // ── Matematik Yardımcıları ────────────────────────────────────

    hexToPixel(q, r) {
        const x = this.hexSize * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
        const y = this.hexSize * (3 / 2 * r);
        return { x, y };
    }

    pixelToHex(x, y) {
        const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / this.hexSize;
        const r = (2 / 3 * y) / this.hexSize;
        return this._axialRound(q, r);
    }

    _axialRound(q, r) {
        let x = q, z = r, y = -x - z;
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const xDiff = Math.abs(rx - x), yDiff = Math.abs(ry - y), zDiff = Math.abs(rz - z);
        if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
        else if (yDiff > zDiff) ry = -rx - rz;
        else rz = -rx - ry;
        return { q: rx, r: rz };
    }

    getHex(q, r) {
        return this.hexes.get(`${q},${r}`);
    }

    getVertexPositions(q, r) {
        const center = this.hexToPixel(q, r);
        const verts = [];
        for (let i = 0; i < 6; i++) {
            const angleDeg = 60 * i - 30;
            const angleRad = Math.PI / 180 * angleDeg;
            verts.push({
                x: center.x + this.hexSize * Math.cos(angleRad),
                y: center.y + this.hexSize * Math.sin(angleRad)
            });
        }
        return verts;
    }

    // ── Mantıksal Sorgular ────────────────────────────────────────

    // Hex komşu mu?
    areHexesAdjacent(id1, id2) {
        const h1 = this.hexes.get(id1);
        return h1 && h1.adjacentHexes.includes(id2);
    }

    // Hex üzerinde veya bitişiğinde yerleşim var mı?
    hexHasAdjacentSettlement(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return false;
        if (h.settlement) return true;
        return h.adjacentHexes.some(ahid => this.hexes.get(ahid).settlement !== null);
    }

    // Hex yerleşime uygun mu? (Biyom + Mesafe)
    hexIsSettlable(hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return false;
        if (['bataklik', 'col'].includes(h.biome)) return false;
        if (this.hexHasAdjacentSettlement(hexId)) return false;
        return true;
    }

    // Oyuncunun hex'e bağlantısı var mı? (Herhangi bir düğmesine yolu ulaşıyor mu?)
    playerConnectedToHex(playerId, hexId) {
        const h = this.hexes.get(hexId);
        if (!h) return false;
        // Herhangi bir düğmesine bağlı yolu var mı?
        return h.nodeIds.some(nid => this.playerConnectedToNode(playerId, nid));
    }

    // Oyuncunun düğmeye (node) ulaşan yolu var mı?
    playerConnectedToNode(playerId, nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        return node.edges.some(eid => this.edges.get(eid).road === playerId);
    }

    // Oyuncunun köy kurabileceği hex'leri döndür
    getBuildableSettlementHexes(playerId) {
        const result = [];
        this.hexes.forEach(h => {
            if (this.hexIsSettlable(h.id) && this.playerConnectedToHex(playerId, h.id)) {
                result.push(h.id);
            }
        });
        return result;
    }

    // Oyuncunun yol kurabileceği kenarları (edge) döndür
    getBuildableRoadEdges(playerId) {
        const result = [];
        this.edges.forEach(e => {
            if (e.road !== null) return;
            // Bir ucu oyuncunun yoluna veya şehrine değmeli
            const n1Ok = this.playerConnectedToNode(playerId, e.node1) || this.nodeHasPlayerSettlement(playerId, e.node1);
            const n2Ok = this.playerConnectedToNode(playerId, e.node2) || this.nodeHasPlayerSettlement(playerId, e.node2);
            if (n1Ok || n2Ok) result.push(e.id);
        });
        return result;
    }

    nodeHasPlayerSettlement(playerId, nodeId) {
        const n = this.nodes.get(nodeId);
        return n.hexes.some(hid => {
            const h = this.hexes.get(hid);
            return h.settlement && h.settlement.playerId === playerId;
        });
    }

    getEdgeBetweenNodes(n1, n2) {
        const node1 = this.nodes.get(n1);
        if (!node1) return null;
        return node1.edges.find(eid => {
            const e = this.edges.get(eid);
            return (e.node1 === n1 && e.node2 === n2) || (e.node1 === n2 && e.node2 === n1);
        });
    }

    // ── Pixel Arama Fonksiyonları ─────────────────────────────────

    _distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
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
    pixelToNearestEdge(px, py, threshold = 25) {
        let best = null, bestDist = threshold;
        this.edges.forEach(edge => {
            const n1 = this.nodes.get(edge.node1);
            const n2 = this.nodes.get(edge.node2);
            if (!n1 || !n2) return;
            const d = this._distToSegment(px, py, n1.x, n1.y, n2.x, n2.y);
            if (d < bestDist) { bestDist = d; best = edge; }
        });
        return best;
    }

    getCornerNodes(count = 2) {
        const allNodes = Array.from(this.nodes.values());
        allNodes.sort((a, b) => {
            const distA = Math.sqrt(a.x*a.x + a.y*a.y);
            const distB = Math.sqrt(b.x*b.x + b.y*b.y);
            return distB - distA;
        });

        const selected = [allNodes[0].id];
        for (let i = 1; i < count; i++) {
             let bestNode = null;
             let maxMinDist = -1;
             for (const node of allNodes) {
                 if (selected.includes(node.id)) continue;
                 let minDist = Infinity;
                 for (const s of selected) {
                     const sn = this.nodes.get(s);
                     const d = Math.sqrt((node.x-sn.x)**2 + (node.y-sn.y)**2);
                     if (d < minDist) minDist = d;
                 }
                 if (minDist > maxMinDist) {
                     maxMinDist = minDist;
                     bestNode = node;
                 }
             }
             if (bestNode) selected.push(bestNode.id);
        }
        return selected;
    }
}
