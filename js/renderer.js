'use strict';
// ============================================================
// Renderer — Canvas üzerinde hex haritayı çizer
// Düz renkli, isimsiz, temiz kutu oyunu stili
// ============================================================

class Renderer {
    constructor(canvas, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = state;
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
        this.unitImages = {};
        this.buildingImages = {};
        this.settlementImages = {};
        this.animations = [];
        this._loadImages();
        this._initCamera();
    }

    getScreenPos(mapX, mapY) {
        return {
            x: mapX * this.scale + this.offsetX,
            y: mapY * this.scale + this.offsetY
        };
    }

    _loadImages() {
        // Birimler
        Object.entries(UNIT_DATA).forEach(([id, data]) => {
            if (data.img) {
                const img = new Image();
                img.src = data.img;
                this.unitImages[id] = img;
            }
        });
        // Yapılar
        Object.entries(BUILDING_ICONS).forEach(([id, src]) => {
            const img = new Image();
            img.src = src;
            this.buildingImages[id] = img;
        });
        // Yerleşimler
        Object.entries(SETTLEMENT_ICONS).forEach(([id, src]) => {
            const img = new Image();
            img.src = src;
            this.settlementImages[id] = img;
        });
    }

    _initCamera() {
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this._initCamera();
    }

    render() {
        const ctx = this.ctx;
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
        this._drawAnimations();

        ctx.restore();
    }

    _drawAnimations() {
        const now = Date.now();
        this.animations = this.animations.filter(anim => {
            const elapsed = now - anim.start;
            const progress = Math.min(1, elapsed / anim.duration);

            if (anim.type === 'melee_swing') {
                this._drawMeleeSwing(anim, progress);
            } else if (anim.type === 'melee_spear') {
                this._drawMeleeSpear(anim, progress);
            } else if (anim.type === 'projectile') {
                this._drawProjectile(anim, progress);
            } else if (anim.type === 'combat_dice') {
                this._drawCombatDice(anim, progress);
            } else if (anim.type === 'siege_dice') {
                this._drawSiegeDice(anim, progress);
            }

            return progress < 1;
        });
    }

    _drawMeleeSwing(anim, progress) {
        const ctx = this.ctx;
        const { from, to } = anim;

        // Saldıran birimin hafifçe ileri gidip gelmesi (Bounce)
        const bounce = Math.sin(progress * Math.PI);
        const dist = 15;
        const dx = (to.x - from.x) * (bounce * 0.5);
        const dy = (to.y - from.y) * (bounce * 0.5);

        // Kılıç savurma çizgisi
        if (progress > 0.2 && progress < 0.8) {
            const p2 = (progress - 0.2) / 0.6;
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const swingAngle = angle - Math.PI / 3 + (Math.PI * 2 / 3 * p2);

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.arc(from.x + dx, from.y + dy, 30, swingAngle - 0.5, swingAngle + 0.5);
            ctx.stroke();

            // Kılıç emojisi
            ctx.font = '20px serif';
            ctx.translate(from.x + dx + Math.cos(swingAngle) * 30, from.y + dy + Math.sin(swingAngle) * 30);
            ctx.rotate(swingAngle + Math.PI / 2);
            ctx.fillText('⚔️', 0, 0);
            ctx.restore();
        }
    }

    _drawMeleeSpear(anim, progress) {
        const ctx = this.ctx;
        const { from, to } = anim;

        // Mızrak saldırısı: İleri doğru güçlü bir dürtme hareketi (Thrust)
        // 0.0 -> 0.4: Geri çekilme
        // 0.4 -> 0.6: İleri fırlama
        // 0.6 -> 1.0: Geri dönme
        let thrust = 0;
        if (progress < 0.4) {
            thrust = -(progress / 0.4) * 0.2; // Hafif geri çekil
        } else if (progress < 0.6) {
            const p = (progress - 0.4) / 0.2;
            thrust = -0.2 + p * 1.2; // İleri ani hareket
        } else {
            const p = (progress - 0.6) / 0.4;
            thrust = 1.0 - p * 1.0; // Eski konuma dönüş
        }

        const dx = (to.x - from.x) * thrust;
        const dy = (to.y - from.y) * thrust;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);

        if (progress > 0.4 && progress < 0.8) {
            // Mızrak ucu efekti (Çizgi şeklinde parlama)
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(from.x + dx, from.y + dy);
            ctx.lineTo(from.x + dx + Math.cos(angle) * 40, from.y + dy + Math.sin(angle) * 40);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.shadowColor = 'white';
            ctx.shadowBlur = 10;
            ctx.stroke();

            // Mızrak emojisi
            ctx.fillStyle = '#000000'; // Emojinin sönük kalmaması için opak renk
            ctx.font = '24px serif';
            ctx.translate(from.x + dx + Math.cos(angle) * 35, from.y + dy + Math.sin(angle) * 35);
            ctx.rotate(angle + Math.PI / 4); // Emojiyi hedefe doğru döndür
            ctx.fillText('🔱', 0, 0); // Mızrak olarak zıpkın veya standart silah (Pike/Trident) kullanıyoruz
            ctx.restore();
        }
    }

    _drawProjectile(anim, progress) {
        const ctx = this.ctx;
        const { from, to } = anim;
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);

        ctx.save();

        // Daha belirgin bir ok izi (Trail)
        if (progress > 0.1) {
            ctx.beginPath();
            const trailLength = Math.min(progress, 0.3); // İzin uzunluğu
            const startX = from.x + (to.x - from.x) * (progress - trailLength);
            const startY = from.y + (to.y - from.y) * (progress - trailLength);
            ctx.moveTo(startX, startY);
            ctx.lineTo(x, y);

            const gradient = ctx.createLinearGradient(startX, startY, x, y);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.8)');

            ctx.strokeStyle = gradient;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Okun kendisi (Daha büyük ve gölgeli)
        ctx.fillStyle = '#000000'; // Emojinin sönük kalmaması için opak renk
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 4);
        ctx.font = '28px serif'; // Daha büyük font
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 5;
        ctx.fillText('🏹', -14, 14); // Ortalama ayarı
        ctx.restore();
    }

    _drawCombatDice(anim, progress) {
        const ctx = this.ctx;
        const { x, y, aRolls, dRolls, aBonus, dBonus, aTotal, dTotal } = anim;
        const opacity = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;

        ctx.save();
        ctx.globalAlpha = opacity;

        const drawDie = (dx, dy, val, isRolling, color = 'white') => {
            const size = 20;
            ctx.fillStyle = color;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1.5;

            ctx.save();
            ctx.translate(dx, dy);
            if (isRolling) ctx.rotate(Math.sin(progress * 25) * 0.4);

            ctx.beginPath();
            ctx.roundRect(-size / 2, -size / 2, size, size, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = color === 'white' ? 'black' : 'white';
            ctx.font = 'bold 13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isRolling ? '?' : val, 0, 0);
            ctx.restore();
        };

        const isRolling = progress < 0.5;
        const offsetY = -45;

        // Saldıran Zarları
        drawDie(x - 45, y + offsetY, aRolls[0], isRolling, '#ff4444');
        drawDie(x - 22, y + offsetY, aRolls[1], isRolling, '#ff4444');

        // Savunan Zarları
        drawDie(x + 22, y + offsetY, dRolls[0], isRolling, '#4444ff');
        drawDie(x + 45, y + offsetY, dRolls[1], isRolling, '#4444ff');

        // Bonuslar (Yeşil küçük yazı)
        if (!isRolling) {
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillStyle = '#4caf50';
            ctx.textAlign = 'center';
            if (aBonus > 0) ctx.fillText(`+${aBonus}`, x - 33, y + offsetY - 15);
            if (dBonus > 0) ctx.fillText(`+${dBonus}`, x + 33, y + offsetY - 15);

            // Toplam Skorlar (Zarların altında)
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';

            // Attacker Total
            ctx.strokeText(aTotal, x - 33, y + offsetY + 25);
            ctx.fillStyle = '#ff4444';
            ctx.fillText(aTotal, x - 33, y + offsetY + 25);

            // Defender Total
            ctx.strokeText(dTotal, x + 33, y + offsetY + 25);
            ctx.fillStyle = '#4444ff';
            ctx.fillText(dTotal, x + 33, y + offsetY + 25);
        }

        // VS yazısı
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VS', x, y + offsetY + 5);

        ctx.restore();
    }

    triggerCombatAnimation(attackerNode, defenderNode, type, aRolls, dRolls, aBonus, dBonus, aTotal, dTotal, unitType) {
        const from = { x: attackerNode.x, y: attackerNode.y };
        const to = { x: defenderNode.x, y: defenderNode.y };

        if (type === 'melee') {
            if (unitType === 'mizrakci') {
                this.animations.push({ type: 'melee_spear', from, to, start: Date.now(), duration: 600 });
            } else {
                this.animations.push({ type: 'melee_swing', from, to, start: Date.now(), duration: 600 });
            }
        } else {
            this.animations.push({ type: 'projectile', from, to, start: Date.now(), duration: 600 });
        }

        setTimeout(() => {
            this.animations.push({
                type: 'combat_dice',
                x: to.x, y: to.y,
                aRolls, dRolls, aBonus, dBonus, aTotal, dTotal,
                start: Date.now(),
                duration: 2500
            });
        }, 300);
    }

    triggerSiegeAnimation(hex, aRolls, dRolls, aBonus, dBonus, aTotal, dTotal, attackerName) {
        this.animations.push({
            type: 'siege_dice',
            x: hex.x, y: hex.y,
            aRolls, dRolls, aBonus, dBonus, aTotal, dTotal,
            attackerName,
            start: Date.now(),
            duration: 2500
        });
    }

    _drawSiegeDice(anim, progress) {
        const ctx = this.ctx;
        const { x, y, aRolls, dRolls, aBonus, dBonus, aTotal, dTotal, attackerName } = anim;
        const opacity = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;
        
        ctx.save();
        ctx.globalAlpha = opacity;
        
        const drawDie = (dx, dy, val, isRolling, color = 'white') => {
            const size = 26;
            ctx.save();
            ctx.translate(dx, dy);
            
            // Düşme efekti
            if (isRolling) {
                const bounce = Math.abs(Math.sin(progress * 15)) * 10;
                ctx.translate(0, -bounce);
                ctx.rotate(progress * 20);
            }

            ctx.fillStyle = color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.roundRect(-size/2, -size/2, size, size, 5);
            ctx.fill();
            ctx.stroke();
            
            if (!isRolling) {
                ctx.fillStyle = color === 'white' ? 'black' : 'white';
                ctx.font = 'bold 16px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(val, 0, 0);
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('?', 0, 0);
            }
            ctx.restore();
        };

        const isRolling = progress < 0.5;
        const offsetY = -130; 
        
        // Saldıran İsmi
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(attackerName || 'Saldıran', x, y + offsetY - 50);
        
        // Saldıran Zarları (Kırmızı/Turuncu)
        drawDie(x - 55, y + offsetY, aRolls[0], isRolling, '#ff5722');
        drawDie(x - 25, y + offsetY, aRolls[1], isRolling, '#ff5722');
        
        // Savunan Zarları (Mavi)
        drawDie(x + 25, y + offsetY, dRolls[0], isRolling, '#2196f3');
        drawDie(x + 55, y + offsetY, dRolls[1], isRolling, '#2196f3');

        if (!isRolling) {
            // Bonuslar
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillStyle = '#4caf50';
            ctx.textAlign = 'center';
            if (aBonus > 0) ctx.fillText(`+${aBonus} Güç`, x - 40, y + offsetY - 25);
            
            // Skorlar
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            
            ctx.strokeText(aTotal, x - 40, y + offsetY + 45);
            ctx.fillStyle = '#ff5722';
            ctx.fillText(aTotal, x - 40, y + offsetY + 45);
            
            ctx.strokeText(dTotal, x + 40, y + offsetY + 45);
            ctx.fillStyle = '#2196f3';
            ctx.fillText(dTotal, x + 40, y + offsetY + 45);

            // Sonuç Yazısı (Vurgulu)
            ctx.font = 'bold 18px Inter, sans-serif';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 4;
            const resultText = aTotal > dTotal ? 'HASAR VERİLDİ! 💥' : 'SAVUNMA BAŞARILI! 🛡️';
            ctx.fillStyle = aTotal > dTotal ? '#ffeb3b' : '#90a4ae';
            ctx.strokeText(resultText, x, y + offsetY + 80);
            ctx.fillText(resultText, x, y + offsetY + 80);
        }
        
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
        const ctx = this.ctx;
        const verts = this.state.grid.getVertexPositions(hex.q, hex.r);
        const info = BIOME_INFO[hex.biome] || { color: '#555', dark: '#333', name: '?' };
        const cx = hex.center.x;
        const cy = hex.center.y;

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
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // ─ Biyom adı (en üstte) ─
        if (info.name) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.font = 'bold 11px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(info.name, cx, cy - 35);

            ctx.fillStyle = '#fff';
            ctx.fillText(info.name, cx - 0.5, cy - 35.5);
        }

        // ─ Vaha için kaynak ikonu (ortada) ─
        if (hex.biome === 'vaha' && hex.resources && hex.resources.length > 0) {
            const resKey = hex.resources[0];
            const rInfo = RESOURCE_INFO[resKey];
            if (rInfo) {
                ctx.font = '24px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Yazıya siyah dış kontur ekle ki belirgin olsun
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 4;
                ctx.fillText(rInfo.emoji, cx, cy - 5);
                ctx.shadowBlur = 0; // Gölgeyi sıfırla
            }
        }

        // ─ Numara dairesi (en altta) ─
        if (hex.number) {
            const isHot = (hex.number === 6 || hex.number === 8);

            // Siyah daire
            ctx.beginPath();
            ctx.arc(cx, cy + 30, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1a1a';
            ctx.fill();
            ctx.strokeStyle = isHot ? '#ff1744' : '#c8a84e';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Numara yazısı
            ctx.fillStyle = isHot ? '#ff5252' : '#f5e8c1';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(hex.number.toString(), cx, cy + 30);
        }
    }

    // ── Highlight çizimi ──────────────────────────────────────────

    _drawHighlights() {
        const ctx = this.ctx;
        const pulse = (Math.sin(Date.now() / 200) + 1) / 2;

        // Aktif oyuncunun rengini al (Yoksayılmaması için garantiye alıyoruz)
        const activePlayer = this.state.currentPlayer;
        const pColor = activePlayer ? activePlayer.color : '#ffd700';

        // Hex highlights
        this.state.highlightedHexes.forEach(hid => {
            const h = this.state.grid.hexes.get(hid);
            if (!h) return;
            const verts = this.state.grid.getVertexPositions(h.q, h.r);
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();
            ctx.fillStyle = pColor;
            ctx.globalAlpha = 0.18;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = pColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        });

        // Edge highlights
        this.state.highlightedEdges.forEach(eid => {
            const e = this.state.grid.edges.get(eid);
            if (!e) return;
            const n1 = this.state.grid.nodes.get(e.node1);
            const n2 = this.state.grid.nodes.get(e.node2);
            if (!n1 || !n2) return;
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = pColor;
            ctx.globalAlpha = 0.6 + pulse * 0.4;
            ctx.lineWidth = 8 + pulse * 6;
            ctx.lineCap = 'round';
            ctx.shadowColor = pColor;
            ctx.shadowBlur = 12 + pulse * 10;
            ctx.stroke();
            ctx.shadowBlur = 0;
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
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });

        // Menzil vurgusu (Range highlights)
        if (this.state.rangeHighlightedNodes) {
            this.state.rangeHighlightedNodes.forEach(nid => {
                const n = this.state.grid.nodes.get(nid);
                if (!n) return;
                ctx.beginPath();
                ctx.arc(n.x, n.y, 16 + pulse * 4, 0, Math.PI * 2);
                ctx.strokeStyle = '#ff1744';
                ctx.lineWidth = 3 + pulse * 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            });
        }
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

            // Dış çerçeve (siyah kenar)
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Ana renk (oyuncu rengi)
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = player.color;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.shadowColor = player.color;
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Ortadaki parlak çizgi
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    // ── Node'lar (köşe noktaları) ─────────────────────────────────

    _drawNodes() {
        const ctx = this.ctx;
        this.state.grid.nodes.forEach(node => {
            // Küçük, belirgin yuvarlaklar
            ctx.beginPath();
            ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f5e8c1'; // Solid renk
            ctx.fill();
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }

    // ── Ordu çizimi ───────────────────────────────────────────────

    _drawArmies() {
        const ctx = this.ctx;
        this.state.grid.nodes.forEach(node => {
            if (!node.army || node.army.units.length === 0) return;

            const units = node.army.units;
            const currentPid = this.state.currentPlayer.id;

            // Oyuncu bazlı ayır
            const pIds = Array.from(new Set(units.map(u => u.playerId !== undefined ? u.playerId : node.army.playerId)));
            const isContested = pIds.length > 1;

            units.forEach((unit, idx) => {
                const pid = unit.playerId !== undefined ? unit.playerId : node.army.playerId;
                const player = this.state.players.find(p => p.id === pid);
                if (!player) return;

                const isSelected = (this.state.selectedUnitNode === node.id &&
                    this.state.selectedUnit &&
                    this.state.selectedUnit.uid === unit.uid);

                const pIdx = pIds.indexOf(pid);
                const pBaseX = isContested ? (pIdx === 0 ? -8 : 8) : 0;
                const pBaseY = isContested ? (pIdx === 0 ? -4 : 4) : 0;

                const uIdx = units.filter((u, i) => i < idx && (u.playerId !== undefined ? u.playerId : node.army.playerId) === pid).length;
                const stackOffset = uIdx * 2;

                const drawX = node.x + pBaseX + stackOffset;
                const drawY = node.y + pBaseY - stackOffset;

                this._drawUnitIcon(drawX, drawY, unit, player, isSelected);

                if (uIdx === 0 && pid === currentPid && unit.movesLeft !== undefined) {
                    ctx.save();
                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillStyle = '#ffeb3b';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = 'black';
                    ctx.shadowBlur = 4;
                    ctx.fillText(`MP:${unit.movesLeft}`, node.x + pBaseX, node.y + pBaseY + 25);
                    ctx.restore();
                }
            });

            const hasSiege = units.some(u => UNIT_DATA[u.type]?.cls === 'kusatma');
            if (hasSiege) {
                ctx.save();
                ctx.font = `14px serif`;
                ctx.textAlign = 'center';
                ctx.fillText('💥', node.x, node.y - 30);
                ctx.restore();
            }
        });
    }

    _drawUnitIcon(x, y, unit, player, isSelected) {
        const ctx = this.ctx;
        const r = 19; // İkonu biraz daha büyüttük
        const data = UNIT_DATA[unit.type];
        const img = this.unitImages[unit.type];

        // 1. Seçim Highlight / Dış Gölge
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#ffd700' : 'rgba(0,0,0,0.3)';
        ctx.fill();

        // 2. Kalın Oyuncu Rengi Çerçevesi
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = player.color; // Takım rengi (Kırmızı/Mavi vb.)
        ctx.fill();

        // İç Beyaz Kontur (Daha şık durması için)
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dış Siyah Kontur (Rengin patlaması için)
        ctx.beginPath();
        ctx.arc(x, y, r + 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. İç Görsel (Daire içine kırpılmış)
        // Kırpma alanını çerçevenin biraz içinde tutuyoruz (r-4)
        if (img && img.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r - 4, 0, Math.PI * 2);
            ctx.clip();

            const size = (r - 4) * 2;
            ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
            ctx.restore();
        } else {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(data.emoji || '👤', x, y);
        }
    }

    // ── Yerleşim çizimi ───────────────────────────────────────────

    _drawSettlements() {
        const ctx = this.ctx;
        this.state.grid.hexes.forEach(hex => {
            if (!hex.settlement) return;
            const st = hex.settlement;
            const p = this.state.players.find(x => x.id === st.playerId);
            const color = p ? p.color : '#fff';

            // Kuşatma Tablosu (Sabit Panel)
            const siege = this.state.sieges[hex.id];
            if (siege) {
                const req = this.state.calculateSiegeRequirement(hex.id, siege.attackerId);
                const attacker = this.state.players.find(p => p.id === siege.attackerId);
                const progress = Math.min(1, siege.points / req);
                
                const panelW = 85;
                const panelH = 45;
                const px = hex.x - panelW / 2;
                const py = hex.y - 85; 

                // Panel Arka Planı (Glassmorphism Effect)
                ctx.save();
                ctx.fillStyle = 'rgba(15, 15, 15, 0.9)';
                ctx.strokeStyle = attacker ? attacker.color : '#ff3300';
                ctx.lineWidth = 2;
                ctx.shadowColor = (attacker ? attacker.color : '#ff3300') + '88';
                ctx.shadowBlur = 12;
                
                ctx.beginPath();
                ctx.roundRect(px, py, panelW, panelH, 6);
                ctx.fill();
                ctx.stroke();

                // Başlık (Saldıran Oyuncu İsmi)
                ctx.fillStyle = attacker ? attacker.color : '#ff3300';
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(attacker ? attacker.name.toUpperCase() : 'KUŞATMA', hex.x, py + 14);

                // İlerleme Metni ve Simge
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px Inter, sans-serif';
                ctx.fillText(`⚔️ ${siege.points} / ${req}`, hex.x, py + 30);

                // Küçük ilerleme çizgisi
                ctx.fillStyle = '#333';
                ctx.fillRect(px + 8, py + panelH - 6, panelW - 16, 3);
                ctx.fillStyle = attacker ? attacker.color : '#ff3300';
                ctx.fillRect(px + 8, py + panelH - 6, (panelW - 16) * progress, 3);
                
                ctx.restore();

                // Kırmızı/Oyuncu rengi halka uyarısı
                ctx.save();
                ctx.strokeStyle = attacker ? attacker.color : '#ff3300';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([8, 5]);
                ctx.beginPath();
                ctx.arc(hex.x, hex.y, 44, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // Yerleşim ikonu ve Arka plan halkası
            const baseSize = st.type === 'metropol' ? 28 : (st.type === 'sehir' ? 22 : 16);
            const icon = st.type === 'metropol' ? '🏯' : (st.type === 'sehir' ? '🏰' : '🏘️');

            // 1. Arka plan halkası (Badge)
            ctx.beginPath();
            ctx.arc(hex.x, hex.y, baseSize * 1.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; // Daha koyu arka plan
            ctx.fill();

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 5; // Daha kalın halka
            ctx.shadowColor = color;
            ctx.shadowBlur = 15; // Parlama efekti
            ctx.stroke();
            ctx.restore();

            // 2. İkon
            ctx.save();
            const img = this.settlementImages[st.type];
            if (img && img.complete) {
                const size = baseSize * 2.5;
                ctx.save();
                ctx.beginPath();
                ctx.arc(hex.x, hex.y, size / 2, 0, Math.PI * 2);
                ctx.clip(); // Kare kısımları kaldırıp yuvarlak kırp

                ctx.shadowColor = color;
                ctx.shadowBlur = 10;
                ctx.drawImage(img, hex.x - size / 2, hex.y - size / 2, size, size);
                ctx.restore();
            } else {
                ctx.fillStyle = '#000000';
                ctx.font = `${baseSize * 1.4}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                const icon = st.type === 'metropol' ? '🏯' : (st.type === 'sehir' ? '🏰' : '🏘️');
                ctx.fillText(icon, hex.x, hex.y);
            }
            ctx.restore();

            // Bina ikonları (Geniş halka)
            if (st.buildings && st.buildings.size > 0) {
                const bArr = [...st.buildings];
                const icons = { ciftlik: '🌾', kisla: '⚔️', kervansaray: '🛒', tapinak: '⛪', muhendishane: '⚙️', tiyatro: '🎭' };
                bArr.forEach((b, i) => {
                    const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
                    const bx = hex.x + Math.cos(angle) * 38;
                    const by = hex.y + Math.sin(angle) * 38;
                    ctx.fillStyle = '#000000'; // Bina ikonları için opaklık

                    const bImg = this.buildingImages[b];
                    if (bImg && bImg.complete) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(bx, by, 10, 0, Math.PI * 2);
                        ctx.clip(); // Yuvarlak kırpma
                        ctx.drawImage(bImg, bx - 10, by - 10, 20, 20);
                        ctx.restore();
                    } else {
                        const icons = { ciftlik: '🌾', kisla: '⚔️', kervansaray: '🛒', tapinak: '⛪', muhendishane: '⚙️', tiyatro: '🎭' };
                        ctx.font = '14px serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(icons[b] || '?', bx, by);
                    }
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
        this.scale = Math.max(0.4, Math.min(3, this.scale * factor));
        this.offsetX = cx - (cx - this.offsetX) * factor;
        this.offsetY = cy - (cy - this.offsetY) * factor;
    }

    canvasToGame(cx, cy) {
        return {
            x: (cx - this.offsetX) / this.scale,
            y: (cy - this.offsetY) / this.scale,
        };
    }

    gameToCanvas(gx, gy) {
        return {
            x: gx * this.scale + this.offsetX,
            y: gy * this.scale + this.offsetY,
        };
    }
}
