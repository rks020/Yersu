'use strict';
// ============================================================
// Renderer — Canvas üzerinde hex haritayı çizer
// Düz renkli, isimsiz, temiz kutu oyunu stili
// ============================================================

class Renderer {
    constructor(canvas, state) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.state   = state;
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
        this._initCamera();
    }

    _initCamera() {
        this.offsetX = this.canvas.width  / 2;
        this.offsetY = this.canvas.height / 2;
    }

    resize(w, h) {
        this.canvas.width  = w;
        this.canvas.height = h;
        this._initCamera();
    }

    render() {
        const ctx  = this.ctx;
        const { width: W, height: H } = this.canvas;

        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        this._drawHexes();
        this._drawHighlights();
        this._drawEdges();
        this._drawNodes();
        this._drawArmies();
        this._drawSettlements();

        ctx.restore();
    }

    startAnimationLoop() {
        const loop = () => {
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // ── Hex çizimi (düz renk + isim + numara) ─────────────────────

    _drawHexes() {
        this.state.grid.hexes.forEach(hex => this._drawHex(hex));
    }

    _drawHex(hex) {
        const ctx   = this.ctx;
        const verts = this.state.grid.getVertexPositions(hex.q, hex.r);
        const info  = BIOME_INFO[hex.biome] || { color: '#555', dark: '#333', name: '?' };
        const cx    = hex.center.x;
        const cy    = hex.center.y;

        // ─ Hex dolgu ─
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();

        // Düz renk dolgu
        ctx.fillStyle = info.color;
        ctx.fill();

        // Altın kenarlık
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth   = 2.5;
        ctx.stroke();

        // ─ Biyom adı (üstte) ─
        if (info.name) {
            ctx.fillStyle    = 'rgba(0,0,0,0.7)';
            ctx.font         = 'bold 11px Georgia, serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(info.name, cx, cy - 20);

            ctx.fillStyle = '#fff';
            ctx.fillText(info.name, cx - 0.5, cy - 20.5);
        }

        // ─ Numara dairesi (ortada) ─
        if (hex.number) {
            const isHot = (hex.number === 6 || hex.number === 8);

            // Siyah daire
            ctx.beginPath();
            ctx.arc(cx, cy + 2, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1a1a';
            ctx.fill();
            ctx.strokeStyle = isHot ? '#d32f2f' : '#c8a84e';
            ctx.lineWidth   = 2;
            ctx.stroke();

            // Numara yazısı
            ctx.fillStyle    = isHot ? '#ff5252' : '#f5e8c1';
            ctx.font         = 'bold 15px Georgia, serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(hex.number.toString(), cx, cy + 2);
        }
    }

    // ── Highlight çizimi ──────────────────────────────────────────

    _drawHighlights() {
        const ctx   = this.ctx;
        const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
        const pColor = this.state.currentPlayer ? this.state.currentPlayer.color : '#ffd700';

        // Hex highlights
        this.state.highlightedHexes.forEach(hid => {
            const h = this.state.grid.hexes.get(hid);
            if (!h) return;
            const verts = this.state.grid.getVertexPositions(h.q, h.r);
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();
            ctx.fillStyle   = pColor;
            ctx.globalAlpha = 0.18;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = pColor;
            ctx.lineWidth   = 2.5;
            ctx.stroke();
        });

        // Edge highlights
        this.state.highlightedEdges.forEach(eid => {
            const e  = this.state.grid.edges.get(eid);
            if (!e) return;
            const n1 = this.state.grid.nodes.get(e.node1);
            const n2 = this.state.grid.nodes.get(e.node2);
            if (!n1 || !n2) return;
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = pColor;
            ctx.globalAlpha = 0.6 + pulse * 0.4;
            ctx.lineWidth   = 8 + pulse * 6;
            ctx.lineCap     = 'round';
            ctx.shadowColor = pColor;
            ctx.shadowBlur  = 12 + pulse * 10;
            ctx.stroke();
            ctx.shadowBlur  = 0;
            ctx.globalAlpha = 1.0;
        });

        // Node highlights
        this.state.highlightedNodes.forEach(nid => {
            const n = this.state.grid.nodes.get(nid);
            if (!n) return;
            ctx.beginPath();
            ctx.arc(n.x, n.y, 14 + pulse * 6, 0, Math.PI * 2);
            ctx.fillStyle = pColor;
            ctx.globalAlpha = 0.3 + pulse * 0.4;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 2.5;
            ctx.shadowColor = pColor;
            ctx.shadowBlur  = 15 + pulse * 15;
            ctx.stroke();
            ctx.shadowBlur  = 0;
            ctx.globalAlpha = 1.0;
        });
    }

    // ── Yollar ────────────────────────────────────────────────────

    _drawEdges() {
        const ctx = this.ctx;
        this.state.grid.edges.forEach(edge => {
            if (edge.road === undefined || edge.road === null) return;
            const n1 = this.state.grid.nodes.get(edge.node1);
            const n2 = this.state.grid.nodes.get(edge.node2);
            if (!n1 || !n2) return;

            const player = this.state.players.find(p => p.id === edge.road);
            if (!player) return;

            // Dış çerçeve (çok kalın siyah kenar)
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = '#000';
            ctx.lineWidth   = 12; // 9'dan 12'ye çıkarıldı
            ctx.lineCap     = 'round';
            ctx.stroke();

            // Ana renk (oyuncu rengi + glow)
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = player.color;
            ctx.lineWidth   = 8; // 6'dan 8'e çıkarıldı
            ctx.lineCap     = 'round';
            ctx.shadowColor = player.color;
            ctx.shadowBlur  = 12; // 8'den 12'ye çıkarıldı
            ctx.stroke();
            ctx.shadowBlur  = 0;

            // Ortadaki çok parlak çizgi (bembeyaz)
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; // 0.35'ten 0.7'ye çıkarıldı
            ctx.lineWidth   = 3; // 2'den 3'e çıkarıldı
            ctx.stroke();
        });
    }

    // ── Node'lar (köşe noktaları) ─────────────────────────────────

    _drawNodes() {
        const ctx = this.ctx;
        this.state.grid.nodes.forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 232, 193, 0.5)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    // ── Ordu çizimi ───────────────────────────────────────────────

    _drawArmies() {
        const ctx = this.ctx;
        const s   = this.state.grid.hexSize;

        this.state.grid.hexes.forEach(hex => {
            if (!hex.army || hex.army.units.length === 0) return;
            const player = this.state.players.find(p => p.id === hex.army.playerId);
            if (!player) return;

            const isSelected = this.state.selectedUnitHex === hex.id;
            const r = s * 0.28;

            // Gölge
            ctx.beginPath();
            ctx.arc(hex.x, hex.y, r + 3, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#ffd700' : 'rgba(0,0,0,0.5)';
            ctx.fill();

            // Ana daire
            ctx.beginPath();
            ctx.arc(hex.x, hex.y, r, 0, Math.PI * 2);
            ctx.fillStyle   = player.color;
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Birim sayısı
            const count = hex.army.units.length;
            ctx.fillStyle    = '#fff';
            ctx.font         = `bold ${Math.round(s * 0.2)}px Georgia, serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(count > 9 ? '9+' : count, hex.x, hex.y);

            // Kuşatma göstergesi
            const hasSiege = hex.army.units.some(u => UNIT_DATA[u.type]?.cls === 'kusatma');
            if (hasSiege) {
                ctx.font = `${Math.round(s * 0.16)}px serif`;
                ctx.fillText('💥', hex.x + r * 0.7, hex.y - r * 0.7);
            }
        });
    }

    // ── Yerleşim çizimi ───────────────────────────────────────────

    _drawSettlements() {
        const ctx = this.ctx;
        this.state.grid.hexes.forEach(hex => {
            if (!hex.settlement) return;
            const st    = hex.settlement;
            const p     = this.state.players.find(x => x.id === st.playerId);
            const color = p ? p.color : '#fff';

            // Kuşatma barı
            const siege = this.state.sieges[hex.id];
            if (siege) {
                const req = this.state.calculateSiegeRequirement(hex.id, siege.attackerId);
                ctx.strokeStyle = '#ff3300';
                ctx.lineWidth   = 3;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(hex.x, hex.y, 30, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#ff3300';
                ctx.font      = 'bold 11px Georgia, serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${siege.points}/${req}`, hex.x, hex.y + 30);
            }

            // Yerleşim ikonu
            const baseSize = st.type === 'metropol' ? 28 : (st.type === 'sehir' ? 22 : 16);
            const icon     = st.type === 'metropol' ? '🏯' : (st.type === 'sehir' ? '🏰' : '🏘️');

            ctx.save();
            ctx.font         = `${baseSize * 1.5}px serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor  = color;
            ctx.shadowBlur   = 12;
            ctx.fillText(icon, hex.x, hex.y);
            ctx.restore();

            // Renk halkası
            ctx.beginPath();
            ctx.arc(hex.x, hex.y, baseSize * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 3;
            ctx.stroke();

            // Bina ikonları (halka)
            if (st.buildings && st.buildings.size > 0) {
                const bArr  = [...st.buildings];
                const icons = { ciftlik:'🌾', kisla:'⚔️', kervansaray:'🛒', tapinak:'⛪', muhendishane:'⚙️', tiyatro:'🎭' };
                bArr.forEach((b, i) => {
                    const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
                    const bx = hex.x + Math.cos(angle) * 32;
                    const by = hex.y + Math.sin(angle) * 32;
                    ctx.font = '14px serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(icons[b] || '?', bx, by);
                });
            }
        });
    }

    // ── Kamera ────────────────────────────────────────────────────

    pan(dx, dy) {
        this.offsetX += dx;
        this.offsetY += dy;
    }

    zoom(factor, cx, cy) {
        this.scale   = Math.max(0.4, Math.min(3, this.scale * factor));
        this.offsetX = cx - (cx - this.offsetX) * factor;
        this.offsetY = cy - (cy - this.offsetY) * factor;
    }

    canvasToGame(cx, cy) {
        return {
            x: (cx - this.offsetX) / this.scale,
            y: (cy - this.offsetY) / this.scale,
        };
    }
}
