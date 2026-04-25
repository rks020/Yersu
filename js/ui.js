'use strict';
// ============================================================
// UI — Arayüz etkileşimlerini yönetir
// ============================================================

class UI {
    constructor(state, actions, renderer) {
        this.state = state;
        this.actions = actions;
        this.renderer = renderer;

        this.els = {
            panelInfo:       document.getElementById('panelInfo'),
            actionMenu:      document.getElementById('actionMenu'),
            logContainer:    document.getElementById('logContainer'),
            turnIndicator:   document.getElementById('turnIndicator'),
            rollDiceBtn:     document.getElementById('btnRollDice'),
            endTurnBtn:      document.getElementById('btnEndTurn'),
            setupInstruction:document.getElementById('setupInstruction'),
            noticeContainer: document.getElementById('floatingNoticeContainer'),

            // Kaynaklar
            resBesin:  document.getElementById('resBesin'),
            resOdun:   document.getElementById('resOdun'),
            resTas:    document.getElementById('resTas'),
            resKil:    document.getElementById('resKil'),
            resMaden:  document.getElementById('resMaden'),
            resGold:   document.getElementById('resGold'),
            popCounter:document.getElementById('popCounter'),
            vpCounter: document.getElementById('vpCounter'),

            // Modallar
            diceModal:    document.getElementById('diceModal'),
            diceResult:   document.getElementById('diceResult'),
            choiceModal:  document.getElementById('choiceModal'),
            choiceGrid:   document.getElementById('choiceGrid'),
            choiceTitle:  document.getElementById('choiceModalTitle'),

            // Ticaret
            tradeModal:     document.getElementById('tradeModal'),
            tradeSellType:  document.getElementById('tradeSellType'),
            tradeBuyType:   document.getElementById('tradeBuyType'),
            tradeAmount:    document.getElementById('tradeAmount'),
            btnConfirmTrade:document.getElementById('btnConfirmTrade'),

            // Biyom
            biomeCard: document.getElementById('biomeDetail'),
            biomeName: document.getElementById('biome-name'),
            biomeBody: document.getElementById('biome-body'),
        };

        this._bindEvents();
    }

    _bindEvents() {
        const canvas = this.renderer.canvas;
        
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e.clientX, e.clientY));
        canvas.addEventListener('mouseleave', () => this.hideBiomeDetail());

        let isDragging = false, lastX, lastY, hasMoved = false;

        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            hasMoved = false;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
            this.renderer.pan(dx, dy);
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            if (!hasMoved && (e.target === canvas || canvas.contains(e.target))) {
                this.handleClick(e.clientX, e.clientY);
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const rect = canvas.getBoundingClientRect();
            this.renderer.zoom(factor, e.clientX - rect.left, e.clientY - rect.top);
        });

        if (this.els.rollDiceBtn)  this.els.rollDiceBtn.addEventListener('click', () => this.handleRollDice());
        if (this.els.endTurnBtn)   this.els.endTurnBtn.addEventListener('click', () => this.handleEndTurn());

        if (this.els.actionMenu) {
            this.els.actionMenu.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (btn) this.handleActionClick(btn.dataset.action);
            });
        }

        if (this.els.btnConfirmTrade) {
            this.els.btnConfirmTrade.addEventListener('click', () => this.handleConfirmTrade());
        }

        const btnRestart = document.getElementById('btnRestart');
        if (btnRestart) {
            btnRestart.addEventListener('click', () => {
                if (confirm("Oyunu yeniden başlatmak istediğinize emin misiniz?")) {
                    window.location.reload();
                }
            });
        }
    }

    // ── Tıklama ──────────────────────────────────────────────────

    handleClick(clientX, clientY) {
        const current = this.state.currentPlayer;
        if (current.isAI || this.state.gameOver) return;

        const rect = this.renderer.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const { x: gx, y: gy } = this.renderer.canvasToGame(px, py);

        const clickedEdge = this.state.grid.pixelToNearestEdge(gx, gy, 25);
        const clickedHex  = this.state.grid.pixelToNearestHex(gx, gy);

        const mode = this.state.actionMode || '';

        // ── SETUP AŞAMASI ──
        if (this.state.phase === 'setup') {
            if (!current.setupDone && clickedHex) {
                const ok = this.actions.setupSettleVillage(current.id, clickedHex.id);
                if (!ok) {
                    this.showNotice("Buraya köy kuramazsınız! (Başka köyden uzak olun)", "danger");
                } else {
                    this.showNotice("Köy kuruldu! Şimdi başlangıç askerinizi yerleştirin.", "success");
                }
            } else if (current.setupDone && clickedHex) {
                const ok = this.actions.setupPlaceInitialUnit(current.id, clickedHex.id);
                if (ok) {
                    this.showNotice("Asker yerleştirildi. Tur geçiyor...", "success");
                    if (window.appMain) window.appMain.nextTurn();
                    else this.state.nextTurn();
                } else {
                    this.showNotice("Buraya asker koyamazsınız!", "danger");
                }
            }
        }
        // ── KÖY KURMA ──
        else if (mode === 'buildVillage' && clickedHex) {
            if (this.actions.buildVillage(current.id, clickedHex.id)) {
                this.showNotice("Köy inşa edildi!", "success");
            } else {
                this.showNotice("Buraya köy inşa edilemez! (Yol bağlantısı ve boşluk gerekli)", "danger");
            }
            this.state.clearSelection();
        }
        // ── YOL İNŞA ──
        else if (mode === 'buildRoad') {
            let targetEdge = clickedEdge;
            if (!targetEdge && this.state.highlightedEdges.size > 0) {
                let best = null, minDist = 60;
                this.state.highlightedEdges.forEach(eid => {
                    const e = this.state.grid.edges.get(eid);
                    const n1 = this.state.grid.nodes.get(e.node1);
                    const n2 = this.state.grid.nodes.get(e.node2);
                    if (n1 && n2) {
                        const d = Math.hypot((n1.x+n2.x)/2 - gx, (n1.y+n2.y)/2 - gy);
                        if (d < minDist) { minDist = d; best = e; }
                    }
                });
                targetEdge = best;
            }

            if (targetEdge) {
                if (this.actions.buildRoad(current.id, targetEdge.id)) {
                    this.showNotice("Yol inşa edildi.", "success");
                } else {
                    this.showNotice("Yol kurulamaz veya kaynak yetersiz!", "danger");
                }
            }
            this.state.clearSelection();
        }
        // ── YAPI İNŞA ──
        else if (mode.startsWith('build_') && clickedHex) {
            const bType = mode.split('_')[1];
            if (this.actions.buildBuilding(current.id, clickedHex.id, bType)) {
                this.showNotice(`${BUILDING_NAMES[bType]} inşa edildi!`, "success");
            } else {
                this.showNotice("Bu yapıyı buraya inşa edemezsiniz!", "danger");
            }
            this.state.clearSelection();
        }
        // ── ASKER EĞİTİMİ ──
        else if (mode === 'trainUnit' && clickedHex) {
            const utype = this.state.selectedUnitType;
            if (utype && this.actions.trainUnit(current.id, utype, clickedHex.id)) {
                this.showNotice(`${UNIT_DATA[utype].name} üretildi!`, "success");
                this.state.clearSelection();
            } else {
                this.showNotice("Burada asker üretilemez! (Yerleşim sahipliği veya altın/popülasyon yok)", "danger");
            }
        }
        // ── ASKER SEÇİMİ (HAREKET/SALDIRI İÇİN) ──
        else if (mode === 'selectUnitForMove' && clickedHex) {
            if (clickedHex.army && clickedHex.army.playerId === current.id) {
                const unit = clickedHex.army.units[0];
                if (unit.moved) {
                   this.showNotice("Bu birim zaten bu tur hareket etti!", "warning");
                   return;
                }
                this.state.selectedUnit = unit;
                this.state.selectedUnitHex = clickedHex.id;
                this.state.actionMode = 'moveOrAttack';
                this.state.highlightedHexes.clear();
                // Hareket menzili
                this.state.grid.getAdjacentHexIds(clickedHex.id).forEach(hid => this.state.highlightedHexes.add(hid));
                this.showNotice("Hareket etmek veya saldırmak için HEDEF HEX'e tıklayın.", "info");
            } else {
                this.state.clearSelection();
            }
        }
        // ── HAREKET VEYA SALDIRI UYGULAMA ──
        else if (mode === 'moveOrAttack' && clickedHex) {
            const unit = this.state.selectedUnit;
            const sourceHexId = this.state.selectedUnitHex;
            
            if (clickedHex.id === sourceHexId) {
                this.state.clearSelection();
                this.update();
                return;
            }

            // Menzilli saldırı mı yoksa hareket/yakın dövüş mü?
            const data = UNIT_DATA[unit.type];
            if (data.range > 0 && clickedHex.army && clickedHex.army.playerId !== current.id) {
                const res = this.actions.attackHex(current.id, unit.uid, clickedHex.id);
                if (res) {
                    if (res !== true) this.showCombatReport(res);
                    this.showCombatAnimation(clickedHex, '🏹');
                } else {
                    this.showNotice("Geçersiz saldırı!", "danger");
                }
            } else {
                const res = this.actions.moveUnit(current.id, unit.uid, clickedHex.id);
                if (res === true) {
                    this.showNotice("Birim hareket etti.", "info");
                } else if (res && typeof res === 'object') {
                    this.showCombatReport(res);
                    this.showCombatAnimation(clickedHex, '⚔️');
                } else {
                    this.showNotice("Geçersiz hareket!", "danger");
                }
            }
            this.state.clearSelection();
        }
        // ── STANDART SEÇİM (BİLGİ GÖRÜNATÜLEME) ──
        else {
            if (clickedHex) {
                this.state.selected = { type: 'hex', id: clickedHex.id };
            } else {
                this.state.selected = null;
            }
        }

        this.update();
    }

    handleMouseMove(clientX, clientY) {
        if (this.state.currentPlayer.isAI) return;

        const rect = this.renderer.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const { x: gx, y: gy } = this.renderer.canvasToGame(px, py);

        const hex = this.state.grid.pixelToNearestHex(gx, gy);
        if (hex) {
            const center = this.state.grid.hexToPixel(hex.q, hex.r);
            const screenX = center.x * this.renderer.scale + this.renderer.offsetX + rect.left;
            const screenY = center.y * this.renderer.scale + this.renderer.offsetY + rect.top;
            this.showBiomeDetail(hex, screenX, screenY);
        } else {
            this.hideBiomeDetail();
        }
    }

    // ── Eylem Butonları ───────────────────────────────────────────

    handleActionClick(actionType) {
        this.state.clearSelection();
        const p = this.state.currentPlayer;

        switch(actionType) {
            case 'build_village':
                if (!p.canAfford(BUILD_COSTS.koy)) {
                    this.showNotice("Köy kurmak için yeterli kaynağınız yok!", "danger");
                    return;
                }
                this.state.actionMode = 'buildVillage';
                this.state.grid.getBuildableSettlementHexes(p.id).forEach(hid => this.state.highlightedHexes.add(hid));
                this.showNotice("Köy kuracağınız HEX'i seçin.", "info");
                break;
            case 'build_road':
                this.state.actionMode = 'buildRoad';
                this.state.grid.getBuildableRoadEdges(p.id).forEach(eid => this.state.highlightedEdges.add(eid));
                this.showNotice("Yol kuracağınız kenarı seçin.", "info");
                break;
            case 'build_building':
                this.showBuildingChoice();
                break;
            case 'train_unit':
                this.showUnitChoice();
                break;
            case 'move_unit':
                this.state.actionMode = 'selectUnitForMove';
                this.showNotice("Saldırmak veya hareket etmek için kendi askerinize tıklayın.", "info");
                p.units.forEach(u => this.state.highlightedHexes.add(u.hexId));
                break;
            case 'trade':
                this.showTradeModal();
                break;
        }
        this.update();
    }

    handleRollDice() {
        if (this.state.subPhase !== 'production') return;
        const roll = this.state.rollProductionDice();
        const gained = this.state.distributeResources(roll);
        this.state.addLog(`🎲 ${this.state.currentPlayer.name} zar attı: ${roll.d1} + ${roll.d2} = ${roll.total}`, 'info');
        this.showDiceModal(roll.total);
        this.state.subPhase = 'action';
        this.update();
    }

    handleEndTurn() {
        if (this.state.subPhase === 'production') {
            this.showNotice("Önce üretim zarını atmalısınız!", "danger");
            return;
        }
        if (window.appMain) window.appMain.nextTurn();
        else { this.state.nextTurn(); this.update(); }
    }

    // ── Görüntü Güncelleme ────────────────────────────────────────

    update() {
        this._updateResources();
        this._updatePanel();
        this._updateLogs();
        this._updateTurnUI();
        this.renderer.render();
    }

    _updateResources() {
        const p = this.state.currentPlayer;
        if (this.els.resBesin) this.els.resBesin.textContent = p.resources.besin;
        if (this.els.resOdun)  this.els.resOdun.textContent  = p.resources.odun;
        if (this.els.resTas)   this.els.resTas.textContent   = p.resources.tas;
        if (this.els.resKil)   this.els.resKil.textContent   = p.resources.kil;
        if (this.els.resMaden) this.els.resMaden.textContent = p.resources.maden;
        if (this.els.resGold)  this.els.resGold.textContent  = p.gold;
        if (this.els.popCounter) this.els.popCounter.textContent = `${p.getPopulationUsed()}/${p.maxPopulation}`;
        if (this.els.vpCounter) this.els.vpCounter.textContent = this.state.calculateVP(p);
    }

    _updateTurnUI() {
        const p = this.state.currentPlayer;
        const phase = this.state.phase === 'setup' ? 'Setup' : 'Main';
        const sub   = this.state.subPhase === 'production' ? 'Üretim' : 'Eylem';
        
        if (this.els.turnIndicator) {
            this.els.turnIndicator.innerHTML = `
                <span style="color:${p.color}">●</span> ${p.name} 
                <small>(${phase} - ${sub})</small>
            `;
        }

        if (this.els.rollDiceBtn) {
            this.els.rollDiceBtn.disabled = (this.state.subPhase !== 'production' || p.isAI);
        }
        if (this.els.endTurnBtn) {
            this.els.endTurnBtn.disabled = (this.state.subPhase === 'production' || p.isAI);
        }
        if (this.els.setupInstruction) {
            this.els.setupInstruction.style.display = (this.state.phase === 'setup' && !p.isAI) ? 'block' : 'none';
        }
    }

    _updatePanel() {
        if (!this.els.panelInfo) return;
        const sel = this.state.selected;
        if (!sel) {
            this.els.panelInfo.innerHTML = '<div class="panel-empty">Detay için bir hex seçin</div>';
            return;
        }

        if (sel.type === 'hex') {
            const h = this.state.grid.hexes.get(sel.id);
            const b = BIOME_INFO[h.biome];
            let html = `<h3>${b.emoji} ${b.name} (${h.id})</h3>`;
            html += `<p>Zar: <b>${h.number || '-'}</b></p>`;
            
            if (h.settlement) {
                const owner = this.state.players.find(p => p.id === h.settlement.playerId);
                html += `<div class="panel-section">
                    <h4>🏗️ Yerleşim: ${h.settlement.type.toUpperCase()}</h4>
                    <p>Sahibi: <span style="color:${owner.color}">${owner.name}</span></p>
                    <p>Yapılar: ${[...h.settlement.buildings].map(b => BUILDING_NAMES[b]).join(', ') || 'Yok'}</p>
                </div>`;
            }
            if (h.army) {
                const owner = this.state.players.find(p => p.id === h.army.playerId);
                html += `<div class="panel-section">
                    <h4>⚔️ Ordu</h4>
                    <p>Mevcut: <span style="color:${owner.color}">${owner.name}</span></p>
                    <ul>${h.army.units.map(u => `<li>${u.type}</li>`).join('')}</ul>
                </div>`;
            }
            this.els.panelInfo.innerHTML = html;
        }
    }

    _updateLogs() {
        if (!this.els.logContainer) return;
        this.els.logContainer.innerHTML = this.state.log.map(l => `
            <div class="log-entry log-${l.type}">
                <span class="log-turn">T${l.turn}</span> ${l.msg}
            </div>
        `).join('');
    }

    showNotice(msg, type = 'info') {
        if (!this.els.noticeContainer) return;
        const el = document.createElement('div');
        el.className = `floating-notice notice-${type}`;
        el.textContent = msg;
        this.els.noticeContainer.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    showDiceModal(total) {
        if (!this.els.diceModal) return;
        this.els.diceResult.textContent = total;
        this.els.diceModal.classList.add('active');
        setTimeout(() => this.els.diceModal.classList.remove('active'), 2000);
    }

    showChoiceModalWithDesc(title, items, onSelect) {
        if (!this.els.choiceModal) return;
        this.els.choiceTitle.textContent = title;
        this.els.choiceGrid.innerHTML = '';
        
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = `choice-item ${item.enabled ? 'enabled' : 'disabled'}`;
            div.innerHTML = `
                <div class="icon" style="font-size:2rem;">${item.icon}</div>
                <div class="name">${item.name}</div>
                <div class="desc" style="font-size:0.75rem; color:#aaa; margin:4px 0; line-height:1.3;">${item.desc || ''}</div>
                <div class="cost">${item.costStr}</div>
            `;
            if (item.enabled) {
                div.onclick = () => {
                    this.els.choiceModal.classList.remove('active');
                    onSelect(item.id);
                };
            } else {
                div.onclick = () => this.showNotice("Yeterli kaynak yok veya kısıtlama var!", "danger");
            }
            this.els.choiceGrid.appendChild(div);
        });
        this.els.choiceModal.classList.add('active');
    }

    showBuildingChoice() {
        const p = this.state.currentPlayer;
        const items = ALL_BUILDINGS.map(bType => {
            const detail = BUILDING_BONUSES[bType]?.[1] || { desc: '' };
            const cost = BUILD_COSTS[bType];
            const enabled = p.canAfford(cost);
            let costStr = Object.entries(cost).map(([r, a]) => `${RESOURCE_INFO[r]?.emoji || ''}${a}`).join(' ');
            return { id: bType, name: BUILDING_NAMES[bType], icon: '🏗️', costStr, enabled, desc: detail.desc || '' };
        });

        this.showChoiceModalWithDesc("İnşa Edilecek Yapı Seçin", items, (bType) => {
            this.state.actionMode = 'build_' + bType;
            this.showNotice("Yapıyı kurmak için bir yerleşim seçin.", "info");
            p.settlements.forEach(hid => {
                const hex = this.state.grid.hexes.get(hid);
                if (hex?.settlement && !hex.settlement.buildings.has(bType)) {
                    this.state.highlightedHexes.add(hid);
                }
            });
            this.update();
        });
    }

    showUnitChoice() {
        const p = this.state.currentPlayer;
        const items = Object.entries(UNIT_DATA).map(([id, data]) => {
            let canBuild = p.gold >= data.gold && p.units.length < p.maxPopulation;
            if (data.cls === 'kusatma' && !p.bonusState?.canBuildSiege) canBuild = false;
            return { id, name: data.name, icon: data.emoji, costStr: `💰${data.gold}`, enabled: canBuild };
        });

        this.showChoiceModalWithDesc("Üretilecek Asker Seçin", items, (uType) => {
            this.state.actionMode = 'trainUnit';
            this.state.selectedUnitType = uType;
            this.showNotice("Askeri yerleştirmek için kendi yerleşiminizi seçin.", "info");
            p.settlements.forEach(hid => this.state.highlightedHexes.add(hid));
            this.update();
        });
    }

    showCombatReport(data) {
        const modal = document.getElementById('combatModal');
        if (!modal) return;
        document.getElementById('combatAttackerName').textContent = data.attacker.player.name;
        document.getElementById('combatAttackerName').style.color = data.attacker.player.color;
        document.getElementById('combatAttackerEmoji').textContent = UNIT_DATA[data.attacker.unit.type]?.emoji || '⚔️';
        document.getElementById('combatDefenderName').textContent = data.defender.player.name;
        document.getElementById('combatDefenderName').style.color = data.defender.player.color;
        document.getElementById('combatDefenderEmoji').textContent = UNIT_DATA[data.defender.unit.type]?.emoji || '🛡️';

        const resultEl = document.getElementById('combatResultText');
        const atkStrEl = document.getElementById('combatAttackerStr');
        const defStrEl = document.getElementById('combatDefenderStr');

        if (data.type === 'overwatch') {
            atkStrEl.textContent = "Geçersiz";
            defStrEl.textContent = "Mancınık Atışı";
            resultEl.textContent = "💥 Mancınık Menziline Giren Birim Yok Edildi!";
            resultEl.style.backgroundColor = "rgba(255, 0, 0, 0.4)";
        } else {
            atkStrEl.textContent = `Saldırı Gücü: ${data.attacker.str}`;
            defStrEl.textContent = `Savunma Gücü: ${data.defender.str}`;
            if (data.winner === 'attacker') {
                resultEl.textContent = `🏆 ${data.attacker.player.name} kazandı! Savunan yok edildi.`;
                resultEl.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
            } else if (data.winner === 'defender') {
                resultEl.textContent = `💀 ${data.defender.player.name} savundu! Saldıran yok edildi.`;
                resultEl.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
            } else {
                resultEl.textContent = "⚔️ Beraberlik! İki taraf da ağır kayıp verdi.";
                resultEl.style.backgroundColor = "rgba(255, 165, 0, 0.3)";
            }
        }
        modal.classList.add('active');
    }

    showTradeModal() {
        if (!this.els.tradeModal) return;
        this.els.tradeModal.classList.add('active');
    }

    handleConfirmTrade() {
        const p = this.state.currentPlayer;
        const sellType = this.els.tradeSellType?.value;
        const buyType  = this.els.tradeBuyType?.value;
        const amount   = parseInt(this.els.tradeAmount?.value);
        if (!sellType || !buyType || isNaN(amount) || amount <= 0) return;
        const ok = this.actions.bankTrade(p.id, sellType, amount, buyType);
        if (ok) {
            this.els.tradeModal.classList.remove('active');
            this.showNotice("Takas başarılı!", "success");
            this.update();
        } else {
            this.showNotice("Takas gerçekleştirilemedi!", "danger");
        }
    }

    showCombatAnimation(hex, emoji) {
        const el = document.createElement('div');
        el.className = 'combat-anim';
        el.textContent = emoji;
        const rect = this.renderer.canvas.getBoundingClientRect();
        const sx = hex.x * this.renderer.scale + this.renderer.offsetX + rect.left;
        const sy = hex.y * this.renderer.scale + this.renderer.offsetY + rect.top;
        el.style.left = `${sx}px`;
        el.style.top  = `${sy}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    hideBiomeDetail() {
        if (this.els.biomeCard) this.els.biomeCard.classList.remove('active');
    }
}
