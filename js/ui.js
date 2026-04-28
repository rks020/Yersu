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
            panelInfo: document.getElementById('panelInfo'),
            actionMenu: document.getElementById('actionMenu'),
            logContainer: document.getElementById('logContainer'),
            turnIndicator: document.getElementById('turnIndicator'),
            rollDiceBtn: document.getElementById('btnRollDice'),
            endTurnBtn: document.getElementById('btnEndTurn'),
            setupInstruction: document.getElementById('setupInstruction'),
            noticeContainer: document.getElementById('floatingNoticeContainer'),

            // Kaynaklar
            resBesin: document.getElementById('resBesin'),
            resOdun: document.getElementById('resOdun'),
            resTas: document.getElementById('resTas'),
            resKil: document.getElementById('resKil'),
            resMaden: document.getElementById('resMaden'),
            resGold: document.getElementById('resGold'),
            popCounter: document.getElementById('popCounter'),
            vpCounter: document.getElementById('vpCounter'),

            // Zar Animasyonu
            diceAnimContainer: document.getElementById('diceAnimationContainer'),
            die1: document.getElementById('die1'),
            die2: document.getElementById('die2'),
            diceTotalResult: document.getElementById('diceTotalResult'),

            // Modallar
            choiceModal: document.getElementById('choiceModal'),
            choiceGrid: document.getElementById('choiceGrid'),
            choiceTitle: document.getElementById('choiceModalTitle'),

            // Ticaret
            tradeModal: document.getElementById('tradeModal'),
            tradeSellType: document.getElementById('tradeSellType'),
            tradeBuyType: document.getElementById('tradeBuyType'),
            tradeBuyType2: document.getElementById('tradeBuyType2'),
            tradeBuyType2Row: document.getElementById('tradeBuyType2Row'),
            tradeAmount: document.getElementById('tradeAmount'),
            btnConfirmTrade: document.getElementById('btnConfirmTrade'),

            // Biyom
            biomeCard: document.getElementById('biomeDetail'),
            biomeName: document.getElementById('biome-name'),
            biomeBody: document.getElementById('biome-body'),

            unitPicker: document.getElementById('unit-picker'),
        };

        this.activeBonusTab = 'ciftlik';
        this._bindEvents();
        this._initBonusPanel();
        this.victoryModalShown = false;
    }

    _getBuildingLevel(player, type) {
        const count = player.buildings?.[type] || 0;
        return count >= 4 ? 3 : (count >= 2 ? 2 : (count >= 1 ? 1 : 0));
    }

    showChangeResourceModal(hexId) {
        const hex = this.state.grid.hexes.get(hexId);
        if (!hex) return;

        const items = RESOURCES.map(res => ({
            id: res,
            name: RESOURCE_INFO[res].name,
            icon: RESOURCE_INFO[res].emoji,
            desc: `${RESOURCE_INFO[res].name} üretimi için ayarla.`,
            enabled: true,
            costStr: ''
        }));

        this.showChoiceModalWithDesc(`⚙️ Kaynak Değiştir (${hexId})`, items, (newRes) => {
            if (this.actions.changeHexResource(this.state.currentPlayer.id, hexId, newRes)) {
                this.showNotice("Bölge kaynağı değiştirildi!", "success");
                this.update();
            }
        });
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

        if (this.els.rollDiceBtn) this.els.rollDiceBtn.addEventListener('click', () => this.handleRollDice());
        if (this.els.endTurnBtn) this.els.endTurnBtn.addEventListener('click', () => this.handleEndTurn());

        if (this.els.actionMenu) {
            this.els.actionMenu.addEventListener('click', (e) => {
                const btn = e.target.closest('.action-btn');
                if (btn && !btn.disabled) {
                    this.handleActionClick(btn.dataset.action, btn.dataset.btype);
                }
            });
        }

        if (this.els.btnConfirmTrade) {
            this.els.btnConfirmTrade.addEventListener('click', () => this.handleConfirmTrade());
        }

        if (this.els.tradeSellType) {
            this.els.tradeSellType.addEventListener('change', () => {
                const isGold = this.els.tradeSellType.value === 'gold';
                if (this.els.tradeBuyType2Row) this.els.tradeBuyType2Row.style.display = isGold ? 'block' : 'none';
                if (this.els.tradeAmount) this.els.tradeAmount.value = isGold ? 1 : 6;
            });
        }

        const btnRestart = document.getElementById('btnRestart');
        if (btnRestart) {
            btnRestart.addEventListener('click', () => {
                if (confirm("Oyunu yeniden başlatmak istediğinize emin misiniz?")) location.reload();
            });
        }

        // Bonus tabları
        document.querySelectorAll('.bonus-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeBonusTab = tab.dataset.btab;
                document.querySelectorAll('.bonus-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._updateBonusCards();
            });
        });
    }

    // ── Tıklama ──────────────────────────────────────────────────

    handleClick(clientX, clientY) {
        const current = this.state.currentPlayer;
        if (current.isAI || this.state.gameOver) return;

        const rect = this.renderer.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const { x: gx, y: gy } = this.renderer.canvasToGame(px, py);

        const clickedNode = this.state.grid.pixelToNearestNode(gx, gy, 20);
        const clickedEdge = this.state.grid.pixelToNearestEdge(gx, gy, 25);
        const clickedHex = this.state.grid.pixelToNearestHex(gx, gy);

        const mode = this.state.actionMode || '';

        // ── SETUP AŞAMASI ──
        if (this.state.phase === 'setup') {
            if (!current.setupDone && clickedHex) {
                const ok = this.actions.setupSettleVillage(current.id, clickedHex.id);
                if (!ok) {
                    this.showNotice("Buraya köy kuramazsınız! (Başka köyden uzak olun)", "danger");
                } else {
                    this.showNotice("Köy kuruldu! Şimdi başlangıç askerinizi bitişik bir düğmeye yerleştirin.", "success");
                    // Köyün düğmelerini parlat
                    this.state.grid.hexes.get(clickedHex.id).nodeIds.forEach(nid => this.state.highlightedNodes.add(nid));
                }
            } else if (current.setupDone && clickedNode) {
                const ok = this.actions.setupPlaceInitialUnit(current.id, clickedNode.id);
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
                        const d = Math.hypot((n1.x + n2.x) / 2 - gx, (n1.y + n2.y) / 2 - gy);
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
        else if ((mode === 'buildBuilding' || mode.startsWith('build_')) && clickedHex) {
            const bType = this.state.selectedBuildingType || mode.split('_')[1];
            if (this.actions.buildBuilding(current.id, clickedHex.id, bType)) {
                this.showNotice(`${BUILDING_NAMES[bType]} inşa edildi!`, "success");
            } else {
                this.showNotice("Bu yapıyı buraya inşa edemezsiniz!", "danger");
            }
            this.state.clearSelection();
        }
        // ── ASKER EĞİTİMİ ──
        else if (mode === 'trainUnit' && clickedNode) {
            const utype = this.state.selectedUnitType;
            if (utype && this.actions.trainUnit(current.id, utype, clickedNode.id)) {
                this.showNotice(`${UNIT_DATA[utype].name} üretildi!`, "success");
                this.state.clearSelection();
            } else {
                this.showNotice("Burada asker üretilemez! (Yerleşim sahipliği veya altın/popülasyon yok)", "danger");
            }
        }
        // ── ASKER SEÇİMİ (HAREKET/SALDIRI İÇİN) ──
        else if (mode === 'selectUnitForMove' && clickedNode) {
            if (clickedNode.army && clickedNode.army.playerId === current.id) {
                const unit = clickedNode.army.units[0];
                if (unit.movesLeft <= 0) {
                    this.showNotice("Bu birimin hareket puanı bitti!", "warning");
                    return;
                }
                this.state.selectedUnit = unit;
                this.state.selectedUnitNode = clickedNode.id;
                this.state.actionMode = 'moveOrAttack';
                this._updateMovementHighlights(clickedNode.id, unit);
                this.showNotice("Hareket etmek veya saldırmak için HEDEF DÜĞME'ye tıklayın.", "info");
            } else {
                this.state.clearSelection();
            }
        }
        // ── HAREKET VEYA SALDIRI UYGULAMA ──
        else if (mode === 'moveOrAttack' && clickedNode) {
            const unit = this.state.selectedUnit;
            const sourceNodeId = this.state.selectedUnitNode;
            const udata = UNIT_DATA[unit.type];

            if (clickedNode.id === sourceNodeId) {
                this.state.clearSelection();
                this.update();
                return;
            }

            const executeAction = (targetUnitUid = null) => {
                // Menzilli saldırı kontrolü
                if (clickedNode.army && clickedNode.army.playerId !== current.id && udata.range > 0) {
                    const res = this.actions.rangeAttack(current.id, unit.uid, clickedNode.id, targetUnitUid);
                    if (res) {
                        this.showCombatAnimation(clickedNode, '🏹');
                        this.showCombatReport(res);
                        this.state.clearSelection();
                        this.update();
                        return;
                    }
                }

                const res = this.actions.moveUnit(current.id, unit.uid, clickedNode.id, targetUnitUid);
                if (res) {
                    if (res.type === 'move') {
                        this.showNotice("Birim hareket etti.", "info");
                    } else {
                        this.showCombatAnimation(clickedNode, res.animation || '⚔️');
                        this.showCombatReport(res);
                    }

                    // Hala hareket puanı var mı?
                    const unitDef = current.units.find(u => u.uid === unit.uid);
                    if (unitDef && unitDef.movesLeft > 0) {
                        this.state.selectedUnitNode = unitDef.nodeId;
                        this._updateMovementHighlights(unitDef.nodeId, unitDef);
                    } else {
                        this.state.clearSelection();
                    }
                } else {
                    this.showNotice("Geçersiz hareket!", "danger");
                    this.state.clearSelection();
                }
                this.update();
            };

            // Eğer hedefte birden fazla DÜŞMAN birimi varsa seçtir
            if (clickedNode.army && clickedNode.army.playerId !== current.id && clickedNode.army.units.length > 1) {
                this.showUnitSelectionModal(clickedNode, (targetUnit) => {
                    executeAction(targetUnit.uid);
                }, clientX, clientY, "Saldırılacak Hedefi Seçin", true);
                return;
            } else {
                executeAction();
            }
        }
        // ── KUŞATMA BAŞLATMA (DÜŞMAN HEX'İNE TIKLANDIĞINDA) ──
        else if (mode === 'moveOrAttack' && clickedHex) {
            const p = this.state.currentPlayer;
            if (clickedHex.settlement && clickedHex.settlement.playerId !== p.id) {
                if (this.actions.startSiege(p.id, clickedHex.id)) {
                    this.showNotice("Kuşatma başlatıldı!", "warning");
                    this.state.clearSelection();
                } else {
                    // startSiege zaten log basıyor, burada sadece temizlik yapalım
                    this.state.clearSelection();
                }
            } else {
                this.state.selected = { type: 'hex', id: clickedHex.id };
                this.state.clearSelection();
            }
        }
        // ── STANDART SEÇİM (BİLGİ GÖRÜNATÜLEME) ──
        else {
            if (clickedNode && clickedNode.army) {
                this.state.selected = { type: 'node', id: clickedNode.id };

                // OTOMATİK HAREKET MODU: Hareket aşamasındaysak ve kendi birimimizse doğrudan hareket moduna geç
                // OTOMATİK HAREKET MODU: Hareket aşamasındaysak ve kendi birimimizse
                if (this.state.subPhase === 'move' && clickedNode.army.playerId === current.id) {
                    const selectUnit = (unit) => {
                        if (unit.movesLeft > 0) {
                            this.state.selectedUnit = unit;
                            this.state.selectedUnitNode = clickedNode.id;
                            this.state.actionMode = 'moveOrAttack';
                            this._updateMovementHighlights(clickedNode.id, unit);
                            this.showNotice(`${UNIT_DATA[unit.type].name} seçildi. Hedef noktaya tıklayarak hareket edin.`, "info");
                        } else {
                            this.showNotice("Bu birimin hareket puanı bitti!", "warning");
                        }
                        this.update();
                    };

                    if (clickedNode.army.units.length > 1) {
                        this.showUnitSelectionModal(clickedNode, selectUnit, clientX, clientY);
                        return; // Modal açıldıysa burayı bitir, callback devam ettirecek
                    } else {
                        selectUnit(clickedNode.army.units[0]);
                    }
                }
            } else if (clickedHex) {
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

        if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
            this.hideBiomeDetail();
            return;
        }

        const { x: gx, y: gy } = this.renderer.canvasToGame(px, py);
        const hex = this.state.grid.pixelToNearestHex(gx, gy);

        if (hex) {
            const dist = Math.sqrt((gx - hex.center.x) ** 2 + (gy - hex.center.y) ** 2);
            // Hex yarıçapı yaklaşık 50-60 birimdir
            if (dist < 60) {
                this.showBiomeDetail(hex, clientX, clientY);
            } else {
                this.hideBiomeDetail();
            }
        } else {
            this.hideBiomeDetail();
        }
    }

    // ── Eylem Butonları ───────────────────────────────────────────

    handleActionClick(actionType, btype = null) {
        try {
            this.state.clearSelection();
            const p = this.state.currentPlayer;

            switch (actionType) {
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
                    if (btype) {
                        if (!p.canAfford(BUILD_COSTS[btype])) {
                            this.showNotice(`${BUILDING_NAMES[btype]} için kaynak yetersiz!`, "danger");
                            return;
                        }
                        this.state.actionMode = 'buildBuilding';
                        this.state.selectedBuildingType = btype;
                        this.showNotice(`${BUILDING_NAMES[btype]} inşa etmek için yerleşim yeriniz olan bir HEX'e tıklayın.`, "info");
                        p.settlements.forEach(hid => {
                            const hex = this.state.grid.hexes.get(hid);
                            if (hex && (!hex.settlement.buildings || !hex.settlement.buildings.has(btype))) {
                                this.state.highlightedHexes.add(hid);
                            }
                        });
                    } else {
                        this.showBuildingChoice();
                    }
                    break;
                case 'train_unit':
                    this.showUnitChoice();
                    break;
                case 'move_unit':
                    this.state.actionMode = 'selectUnitForMove';
                    this.showNotice("Saldırmak veya hareket etmek için kendi askerinize tıklayın.", "info");
                    p.units.forEach(u => this.state.highlightedNodes.add(u.nodeId));
                    break;
                case 'trade':
                    this.showTradeModal();
                    break;
            }
            this.update();
        } catch (err) {
            console.error("UI Aksiyon Hatası:", err);
            this.showNotice("İşlem sırasında hata oluştu: " + err.message, "danger");
        }
    }

    handleRollDice() {
        if (this.state.subPhase !== 'production') return;
        const roll = this.state.rollProductionDice();
        // this.state.addLog(`🎲 ${this.state.currentPlayer.name} zar attı: ${roll.d1} + ${roll.d2} = ${roll.total}`, 'info'); // state.js zaten log basıyor
        this.showDiceModal(roll);
        if (roll.gained) this.showResourceAnimation(roll.gained);
        this.update();
    }

    handleEndTurn() {
        if (this.state.subPhase === 'production') {
            this.showNotice("Önce üretim zarını atmalısınız!", "danger");
            return;
        }
        if (this.state.subPhase === 'build') {
            this.state.transitionToMove();
            this.update();
            return;
        }
        if (window.appMain) window.appMain.nextTurn();
        else { this.state.nextTurn(); this.update(); }
    }

    // ── Görüntü Güncelleme ────────────────────────────────────────

    update() {
        this._updateResources();
        this._updatePanel();
        this._updateMilitaryTable();
        this._updateBuildingDots();
        this._updateBonusCards();
        this._updateLogs();
        this._updateTurnUI();
        this._updateActionButtons();
        this._updateCostLabels();
        this.renderer.render();
        // Zafer Kontrolü
        if (this.state.gameOver && this.state.winner && !this.victoryModalShown) {
            this.showVictoryModal(this.state.winner);
            this.victoryModalShown = true;
        }

        // AI Zarını Görselleştir
        if (this.state.lastRoll && !this.state.lastRoll.uiShown) {
            this.showDiceModal(this.state.lastRoll);
            this.state.lastRoll.uiShown = true;
        }

        // Bekleyen Seçimleri Kontrol Et (Sıra gerçek oyuncudaysa)
        const curP = this.state.currentPlayer;
        if (!curP.isAI && curP.pendingChoices && curP.pendingChoices.length > 0 && !this.choiceModalOpen) {
            const nextChoice = curP.pendingChoices[0];
            this.showChoiceModal(nextChoice.type, nextChoice.level);
        }
    }

    showVictoryModal(winner) {
        const modal = document.getElementById('victoryModal');
        const title = document.getElementById('victoryTitle');
        const msg = document.getElementById('victoryMessage');
        const stats = document.getElementById('victoryStats');
        if (!modal) return;

        title.textContent = winner.id === this.state.currentPlayer.id ? "TEBRİKLER, KAZANDIN!" : "OYUN BİTTİ";
        msg.textContent = `${winner.name} imparatorluğunu kurarak tüm dünyaya hükmetti.`;

        const vp = this.state.calculateVP(winner);
        stats.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 10px; color: var(--gold);">Toplam Puan: ${vp}</div>
            <div style="font-size: 0.9rem; color: #ccc;">Şehir Sayısı: ${winner.settlements.length}</div>
            <div style="font-size: 0.9rem; color: #ccc;">Tur: ${this.state.turn}</div>
        `;

        modal.classList.add('active');
    }

    checkPendingChoices() {
        const p = this.state.currentPlayer;
        if (p.isAI || this.state.gameOver) return;

        if (p.pendingChoices.length > 0 && !this.choiceModalOpen) {
            const choice = p.pendingChoices[0];
            this.showChoiceModal(choice.type, choice.level);
        }
    }

    _updateResources() {
        const p = this.state.currentPlayer;
        if (this.els.resBesin) this.els.resBesin.textContent = p.resources.besin;
        if (this.els.resOdun) this.els.resOdun.textContent = p.resources.odun;
        if (this.els.resTas) this.els.resTas.textContent = p.resources.tas;
        if (this.els.resKil) this.els.resKil.textContent = p.resources.kil;
        if (this.els.resMaden) this.els.resMaden.textContent = p.resources.maden;
        if (this.els.resGold) this.els.resGold.textContent = p.resources.gold;
        const pop = `${p.getPopulationUsed()}/${p.maxPopulation}`;
        if (this.els.popCounter) this.els.popCounter.textContent = pop;
        const vp = this.state.calculateVP(p);
        if (this.els.vpCounter) this.els.vpCounter.textContent = `⭐${vp}`;

        // Başlık yapımcı
        const nameEl = document.getElementById('playerNameHeader');
        if (nameEl) nameEl.textContent = p.name;
        const crestEl = document.getElementById('playerCrest');
        if (crestEl) { crestEl.style.background = p.color + '33'; crestEl.style.borderColor = p.color; }

        // Üretim oranları (tahmini - o an seçiliyse)
        const prodSuffix = ['Besin', 'Odun', 'Tas', 'Kil', 'Maden', 'Gold'];
        const prodKeys = ['besin', 'odun', 'tas', 'kil', 'maden', 'gold'];
        prodKeys.forEach((key, i) => {
            const el = document.getElementById(`res${prodSuffix[i]}Prod`);
            if (el) {
                // Oyuncu yerleşimlerinden beklenen üretimi hesapla
                let prod = 0;
                if (p.settlements) {
                    p.settlements.forEach(hid => {
                        const hex = this.state.grid?.hexes?.get(hid);
                        if (hex && hex.resources) {
                            // hex.resources bir dizi (Array), key ('besin' vb.) var mı bakmalıyız
                            if (hex.resources.includes(key)) {
                                prod += 1; // Her yerleşim o kaynağı içeren hex'teyse +1 üretim (tahmini)
                            }
                        }
                    });
                }
                el.textContent = prod > 0 ? `+${prod}` : '';
            }
        });
    }

    _updateTurnUI() {
        const p = this.state.currentPlayer;
        const sub = (this.state.subPhase === 'production') ? 'Üretim' :
            (this.state.subPhase === 'build') ? 'İnşa & Ticaret' :
                (this.state.subPhase === 'move') ? 'Hareket' : 'Eylem';

        if (this.els.turnIndicator) {
            this.els.turnIndicator.innerHTML = `Tur ${this.state.turn} — <span style="color:${p.color}">${p.name}</span> (${sub})`;
        }
        if (this.els.rollDiceBtn) this.els.rollDiceBtn.disabled = (this.state.subPhase !== 'production' || p.isAI);
        if (this.els.endTurnBtn) {
            this.els.endTurnBtn.disabled = (this.state.subPhase === 'production' || p.isAI);
            this.els.endTurnBtn.textContent = (this.state.subPhase === 'build') ? '⏭ Hareket Aşaması' : '🏁 Turu Bitir';
        }
        if (this.els.setupInstruction) {
            this.els.setupInstruction.style.display = (this.state.phase === 'setup' && !p.isAI) ? 'block' : 'none';
        }
    }

    _updateCostLabels() {
        const p = this.state.currentPlayer;

        // Yol Maliyeti Güncelle
        const roadEl = document.getElementById('cost-road');
        if (roadEl) {
            let odun = BUILD_COSTS.yol.odun;
            let tas = BUILD_COSTS.yol.tas;
            if (p.bonusState.roadDiscountRes === 'odun') odun = Math.max(0, odun - 1);
            if (p.bonusState.roadDiscountRes === 'tas') tas = Math.max(0, tas - 1);
            roadEl.innerHTML = `<span>🪵${odun}</span><span>🪨${tas}</span>`;
        }

        // Genel Yapı Maliyetleri (Statik)
        ALL_BUILDINGS.forEach(b => {
            const el = document.getElementById(`cost-${b}`);
            if (el) {
                const cost = BUILD_COSTS[b];
                let text = "";
                if (cost.besin) text += `🌾${cost.besin} `;
                if (cost.odun) text += `🪵${cost.odun} `;
                if (cost.tas) text += `🪨${cost.tas} `;
                if (cost.kil) text += `🧱${cost.kil} `;
                if (cost.maden) text += `⚙️${cost.maden} `;
                if (cost.gold) text += `💰${cost.gold} `;
                el.textContent = text.trim();
            }
        });

        // Kervansaray Yol İndirimi UI Güncelleme (Sol Paneldeki Yol Satırı)
        const roadCostEl = document.getElementById('cost-road');
        if (roadCostEl) {
            const p = this.state.currentPlayer;
            let roadCost = { ...BUILD_COSTS.yol };
            if (p.bonusState.roadDiscountRes) {
                roadCost[p.bonusState.roadDiscountRes] = Math.max(0, roadCost[p.bonusState.roadDiscountRes] - 1);
            }
            let html = `<span>🪵${roadCost.odun}</span><span>🪨${roadCost.tas}</span>`;
            roadCostEl.innerHTML = html;
        }
    }

    _updateActionButtons() {
        const p = this.state.currentPlayer;
        const sub = this.state.subPhase;
        const isTurn = !p.isAI && !this.state.gameOver;
        const isMain = this.state.phase === 'Main';

        document.querySelectorAll('.action-btn').forEach(btn => {
            const action = btn.dataset.action;
            const btype = btn.dataset.btype;
            let cost = null;

            if (action === 'build_village') cost = BUILD_COSTS.koy;
            else if (action === 'build_road') {
                cost = { ...BUILD_COSTS.yol };
                if (p.bonusState.roadDiscountRes) {
                    cost[p.bonusState.roadDiscountRes] = Math.max(0, cost[p.bonusState.roadDiscountRes] - 1);
                }
            } else if (action === 'build_building' && btype) {
                cost = BUILD_COSTS[btype];
                if (BUILD_COSTS[btype].gold) cost = { ...cost, gold: BUILD_COSTS[btype].gold };
            }

            let canAfford = true;
            let titleText = "";
            if (cost) {
                const missing = [];
                for (const [res, amt] of Object.entries(cost)) {
                    const has = p.resources[res] || 0;
                    if (has < amt) {
                        missing.push(`${RESOURCE_INFO[res].name} (${amt - has} eksik)`);
                        canAfford = false;
                    }
                }
                if (!canAfford) titleText = "⚠️ Yetersiz Kaynak: " + missing.join(", ");
            }

            if (action === 'train_unit') {
                const hasPop = p.units.length < p.maxPopulation;
                if (!hasPop) titleText = "⚠️ Nüfus Dolu (Yeni yerleşim kurun veya geliştirin)";
            }

            // Debug için buton başlığına faz bilgisi ekleyelim
            btn.title = `${titleText} [Sıra:${isTurn ? 'Sende' : 'Başkası'}, Faz:${this.state.phase}, AltFaz:${sub}]`;

            if (action === 'move_unit') {
                btn.disabled = !isTurn || sub !== 'move';
            } else if (action === 'train_unit' || action === 'trade') {
                // Ana oyunda sıra sendeyse her zaman aktif olsun (üretim zarı atılmamışsa kapat)
                btn.disabled = !isTurn || !isMain || sub === 'production';
            } else {
                // İnşa butonları
                if (!isMain) {
                    btn.disabled = !isTurn || action !== 'build_village' || !canAfford;
                } else {
                    btn.disabled = !isTurn || sub !== 'build' || !canAfford;
                }
            }
        });
    }

    _updateBuildingDots() {
        const p = this.state.currentPlayer;
        document.querySelectorAll('.bld-row').forEach(row => {
            const btype = row.dataset.btype;
            if (!btype) return;
            const count = p.buildings?.[btype] || 0;
            const level = count >= 4 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;
            const dots = row.querySelectorAll('.bld-dot');
            dots.forEach((dot, i) => dot.classList.toggle('active', i < level));
        });
    }

    _updateMilitaryTable() {
        const tbody = document.getElementById('militaryTableBody');
        const popEl = document.getElementById('popCounterMilitary');
        if (!tbody) return;
        const p = this.state.currentPlayer;
        if (popEl) popEl.textContent = `${p.getPopulationUsed()}/${p.maxPopulation}`;

        if (!p.units || p.units.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#666;font-size:0.78rem;">Henüz birim yok</td></tr>';
            return;
        }

        // Tip bazında grupla
        const grouped = {};
        p.units.forEach(u => { if (!grouped[u.type]) grouped[u.type] = []; grouped[u.type].push(u); });

        let html = '';
        for (const [type, units] of Object.entries(grouped)) {
            const data = UNIT_DATA[type];
            if (!data) continue;

            // Temel bonuslar
            const baseParts = [];
            if (data.duel > 0) baseParts.push(`Düello +${data.duel}`);
            if (data.duel < 0) baseParts.push(`Düello ${data.duel}`);
            if (data.range > 0) baseParts.push(`Menzil +${data.range}`);
            if (data.siege > 0) baseParts.push(`Kuşatma +${data.siege}`);
            if (data.special === 'anti_cavalry') baseParts.push('+1 vs Süvari');
            if (data.special === 'anti_infantry') baseParts.push('+1 vs Piyade');

            // Yapı bonusları
            const bldParts = [];
            let duelBonus = 0;
            const kislaCount = p.buildings?.['kisla'] || 0;
            const kislaLv = kislaCount >= 4 ? 3 : kislaCount >= 2 ? 2 : kislaCount >= 1 ? 1 : 0;
            
            if (kislaLv >= 1) {
                const c1 = p.bonusState.kislaLv1Choice;
                if (c1 === 'A' && type === 'mizrakci') { duelBonus += 1; bldParts.push('Kışla (Sv1): +1'); }
                else if (c1 === 'B' && type === 'kilicli') { duelBonus += 1; bldParts.push('Kışla (Sv1): +1'); }
                else if (c1 === 'C' && type === 'okcu') { duelBonus += 1; bldParts.push('Kışla (Sv1): +1'); }
            }
            if (kislaLv >= 2) {
                const c2 = p.bonusState.kislaLv2Choice;
                if (c2 === 'B' && type === 'sovalye') { duelBonus += 1; bldParts.push('Kışla (Sv2): +1'); }
            }
            if (kislaLv >= 3) {
                const c3 = p.bonusState.kislaLv3Choice;
                if (c3 === 'A') { duelBonus += 1; bldParts.push('Kışla (Sv3): +1'); }
                else if (c3 === 'B' && ['kocbasi','mancinik','topcu'].includes(type)) { duelBonus += 1; bldParts.push('Kışla (Sv3): +1'); }
            }

            const tapinak = p.buildings?.['tapinak'] >= 1;
            if (tapinak) bldParts.push('Tapınak: +1 (Kuşatmada)');

            const muhLv = p.buildings?.['muhendishane'] >= 2 ? 2 : 0;
            if (muhLv >= 2 && data.range > 0) bldParts.push('Mühendishane: Menzil +1');

            // Toplam
            const totalDuel = data.duel + duelBonus;
            const totalParts = [];
            if (totalDuel !== 0) totalParts.push(`Düello ${totalDuel > 0 ? '+' : ''}${totalDuel}`);
            if (data.range > 0) totalParts.push(`Menzil ${data.range + (muhLv >= 2 ? 1 : 0)}`);
            if (data.siege > 0) totalParts.push(`Kuşatma +${data.siege}`);

            html += `
            <tr>
                <td><div class="mil-unit-cell">
                    <span class="mil-unit-emoji">${data.img ? `<img src="${data.img}" style="width:24px;height:24px;vertical-align:middle;object-fit:contain;">` : (data.emoji || '👤')}</span>
                    <span class="mil-unit-name">${data.name}</span>
                </div></td>
                <td class="mil-count">${units.length}</td>
                <td class="mil-bonus-base">${baseParts.join(', ') || '-'}</td>
                <td class="mil-bonus-bld">${bldParts.join('<br>') || '-'}</td>
                <td class="mil-bonus-total total-col">${totalParts.join(', ') || '-'}</td>
            </tr>`;
        }
        tbody.innerHTML = html;
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
            if (!h) return;
            const b = BIOME_INFO[h.biome];

            let html = `
                <div class="hex-biome-header">
                    <span class="hex-biome-emoji">${b.emoji}</span>
                    <div>
                        <div class="hex-biome-name">${b.name.toUpperCase()}</div>
                        <div style="font-size:0.65rem; color:#ccc;">ID: ${h.id} | Üretim: ${b.resName || '-'}</div>
                    </div>
                    <div class="hex-num-badge">${h.number || '-'}</div>
                </div>

                <div class="hex-section-title">ÜRETİLEN KAYNAKLAR</div>
                <div class="hex-res-row">
                    ${(b.fixedRes || []).map(res => `
                        <div class="hex-res-chip">${RESOURCE_INFO[res].emoji} ${RESOURCE_INFO[res].name}</div>
                    `).join('')}
                    ${h.resources.filter(r => !(b.fixedRes || []).includes(r)).map(res => `
                        <div class="hex-res-chip" style="border-color:var(--gold);">${RESOURCE_INFO[res].emoji} ${RESOURCE_INFO[res].name} (Zar)</div>
                    `).join('')}
                </div>
            `;

            if (h.settlement) {
                const owner = this.state.players.find(p => p.id === h.settlement.playerId);
                html += `
                    <div class="hex-section-title">YERLEŞİM</div>
                    <div class="hex-settlement-card">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div class="hex-settlement-name">${h.settlement.type === 'koy' ? '🛖 Köy' : h.settlement.type === 'sehir' ? '🏰 Şehir' : '🏛️ Metropol'}</div>
                            <div style="width:16px; height:16px; border-radius:3px; background:${owner.color}; border:1px solid rgba(255,255,255,0.3);"></div>
                        </div>
                        <div style="font-size:0.65rem; color:#aaa; margin-top:2px;">${owner.name}</div>
                        
                        <div class="hex-section-title" style="font-size:0.55rem; margin-top:8px;">YAPILAR</div>
                        <div class="hex-buildings-list">
                            ${[...h.settlement.buildings].map(btype => `
                                <div class="hex-bld-item">
                                    <span>${BUILDING_ICONS[btype]} ${BUILDING_NAMES[btype]}</span>
                                    <span class="hex-bld-lv">Sv. ${Math.min(3, this._getBuildingLevel(owner, btype))}</span>
                                </div>
                            `).join('')}
                            ${h.settlement.buildings.size < 6 ? `
                                <div class="hex-bld-item hex-empty-slot">Boş - İnşa edilebilir</div>
                            ` : ''}
                        </div>
                    </div>

                    ${owner.id === this.state.currentPlayer.id && this.state.currentPlayer.bonusState.canChangeBiomeResource && this.state.subPhase === 'production' ? `
                        <div style="margin-top:10px;">
                            <button class="btn-action-full" style="background:#455A64; border-color:#607D8B;" onclick="window.appMain.ui.showChangeResourceModal('${h.id}')">⚙️ Kaynağı Değiştir (Bonus)</button>
                        </div>
                    ` : ''}
                `;
            } else {
                html += `
                    <div class="hex-section-title">YERLEŞİM</div>
                    <div class="hex-settlement-card" style="border-style:dashed; opacity:0.6;">
                        <div class="hex-empty-slot">Boş Hex - Köy kurulabilir</div>
                    </div>
                `;
            }

            if (h.army) {
                const owner = this.state.players.find(p => p.id === h.army.playerId);
                html += `
                    <div class="hex-section-title">ORDU</div>
                    <div class="hex-settlement-card">
                        <div style="font-size:0.75rem; color:#ddd; font-weight:600; margin-bottom:4px;">${owner.name} Birliği</div>
                        <div style="display:flex; flex-wrap:wrap; gap:3px;">
                            ${h.army.units.map(u => {
                                const ud = UNIT_DATA[u.type];
                                return ud.img ? `<img src="${ud.img}" style="width:18px;height:18px;object-fit:contain;" title="${ud.name}">` : `<span title="${ud.name}">${ud.emoji || '👤'}</span>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            this.els.panelInfo.innerHTML = html;
        }
        else if (sel.type === 'node') {
            const node = this.state.grid.nodes.get(sel.id);
            if (!node || !node.army) {
                this.state.selected = null;
                this._updatePanel();
                return;
            }
            const owner = this.state.players.find(p => p.id === node.army.playerId);

            let html = `
                <div class="hex-biome-header">
                    <span class="hex-biome-emoji">🚩</span>
                    <div>
                        <div class="hex-biome-name">ORDU / BİRLİK</div>
                        <div style="font-size:0.65rem; color:#888;">Konum ID: ${node.id}</div>
                    </div>
                    <div style="width:20px; height:20px; border-radius:50%; background:${owner.color}; border:2px solid rgba(255,255,255,0.4); box-shadow:0 0 10px ${owner.color}88;"></div>
                </div>

                <div class="hex-section-title">SAHİBİ: ${owner.name.toUpperCase()}</div>
                
                <div class="unit-info-list" style="margin-top:10px;">
                    ${node.army.units.map(u => {
                const data = UNIT_DATA[u.type];
                if (!data) return '';
                return `
                            <div class="hex-settlement-card" style="margin-bottom:8px; border-left: 3px solid ${owner.color};">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-size:1.8rem;">${data.img ? `<img src="${data.img}" style="width:32px;height:32px;object-fit:contain;">` : (data.emoji || '👤')}</span>
                                    <div style="flex:1;">
                                        <div style="font-weight:700; color:#eee;">${data.name}</div>
                                        <div style="display:flex; gap:8px; font-size:0.65rem; color:#aaa; margin-top:2px;">
                                            <span>👣 Hareket: ${u.movesLeft.toFixed(1)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
                                    <div style="font-size:0.65rem; color:#ccc;">🎲 Düello: <b>${data.duel >= 0 ? '+' : ''}${data.duel}</b></div>
                                    <div style="font-size:0.65rem; color:#ccc;">⚡ Hız: <b>${data.speed}</b></div>
                                    ${data.range > 0 ? `<div style="font-size:0.65rem; color:#ccc;">🏹 Menzil: <b>${data.range}</b></div>` : ''}
                                    ${data.siege > 0 ? `<div style="font-size:0.65rem; color:#ccc;">🛡️ Kuşatma: <b>+${data.siege}</b></div>` : ''}
                                </div>
                            </div>
                        `;
            }).join('')}
                </div>
            `;
            this.els.panelInfo.innerHTML = html;
        }
    }

    _initBonusPanel() {
        this._updateBonusCards();
    }

    _updateBonusCards() {
        const wrap = document.getElementById('bonusCardsWrap');
        if (!wrap) return;
        const btype = this.activeBonusTab;
        const p = this.state.currentPlayer;
        const bonuses = BUILDING_BONUSES[btype];
        if (!bonuses) return;
        const builtCount = p.buildings?.[btype] || 0;
        const currentLevel = builtCount >= 4 ? 3 : builtCount >= 2 ? 2 : builtCount >= 1 ? 1 : 0;

        let html = '';
        [1, 2, 3].forEach(lv => {
            const lvBonuses = bonuses[lv];
            const isActive = lv <= currentLevel;
            const isNext = lv === currentLevel + 1;

            html += `
                <div class="bonus-card ${isActive ? 'active-level' : ''}" style="opacity: ${isActive || isNext ? 1 : 0.4}">
                    <div class="bonus-card-header">${BUILDING_NAMES[btype].toUpperCase()} - SEVİYE ${lv}</div>
                    <div class="bonus-card-options">
            `;

            if (lvBonuses.length > 1) {
                // Seçmeli bonuslar (A, B)
                lvBonuses.forEach((desc, idx) => {
                    const letter = String.fromCharCode(65 + idx); // A, B...
                    const isChosen = p.chosenBonuses?.[btype]?.[lv] === letter;
                    html += `
                        <div class="bonus-option ${isChosen ? 'chosen' : ''}">
                            <div class="bonus-option-badge">${letter}</div>
                            <div>${desc}</div>
                        </div>
                    `;
                });
            } else {
                // Tek bonus
                html += `<div class="bonus-card-single">${lvBonuses[0]}</div>`;
            }

            html += `
                    </div>
                </div>
            `;
        });
        wrap.innerHTML = html;
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

    showDiceModal(roll) {
        if (!roll || !this.els.diceAnimContainer) return;
        const { d1, d2, total } = roll;
        const { diceAnimContainer, die1, die2, diceTotalResult } = this.els;

        // Reset
        diceAnimContainer.classList.add('active');
        diceTotalResult.classList.remove('show');
        die1.textContent = '?';
        die2.textContent = '?';
        die1.classList.remove('rolling', 'settle');
        die2.classList.remove('rolling', 'settle');

        // Force reflow
        void die1.offsetWidth;

        // Roll phase
        die1.classList.add('rolling');
        die2.classList.add('rolling');

        // Settle phase
        setTimeout(() => {
            die1.classList.remove('rolling');
            die2.classList.remove('rolling');
            die1.classList.add('settle');
            die2.classList.add('settle');
            
            die1.textContent = d1;
            die2.textContent = d2;

            // Efektler
            this._createParticles(die1);
            this._createParticles(die2);
            
            setTimeout(() => {
                diceTotalResult.textContent = `Toplam: ${total}`;
                diceTotalResult.classList.add('show');
                
                setTimeout(() => {
                    diceAnimContainer.classList.remove('active');
                }, 2000);
            }, 600);
        }, 900);
    }

    _createParticles(el) {
        const rect = el.getBoundingClientRect();
        const container = this.els.diceAnimContainer;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Konteyner relative olduğu için canvasWrapper koordinatlarına göre hesaplamalıyız
        // Ancak fixed particle daha kolay olabilir. Ama CSS'de position: absolute;
        // Konteyner içinde oluşturmak en iyisi.
        
        const contRect = container.getBoundingClientRect();
        const relX = centerX - contRect.left;
        const relY = centerY - contRect.top;

        for (let i = 0; i < 12; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.backgroundColor = i % 2 === 0 ? 'var(--gold)' : '#fff';
            p.style.left = relX + 'px';
            p.style.top = relY + 'px';
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 80;
            const px = Math.cos(angle) * dist;
            const py = Math.sin(angle) * dist;
            
            p.style.setProperty('--px', `${px}px`);
            p.style.setProperty('--py', `${py}px`);
            
            container.appendChild(p);
            setTimeout(() => p.remove(), 700);
        }
    }

    showUnitSelectionModal(node, onSelect, clientX, clientY, title = "Birimi Seçin", isEnemy = false) {
        const picker = this.els.unitPicker;
        if (!picker) return;
        
        picker.innerHTML = `<div style="font-size:0.7rem; color:var(--gold); font-weight:bold; padding:4px 8px; border-bottom:1px solid rgba(255,215,0,0.2); margin-bottom:4px;">${title}</div>`;
        
        node.army.units.forEach(u => {
            const data = UNIT_DATA[u.type];
            const item = document.createElement('div');
            const canSelect = isEnemy || u.movesLeft > 0;
            item.className = `unit-picker-item ${canSelect ? '' : 'disabled'}`;
            
            const iconHtml = data.img ? `<img src="${data.img}">` : `<span class="emoji">${data.emoji || '👤'}</span>`;
            
            item.innerHTML = `
                ${iconHtml}
                <div class="unit-picker-info">
                    <div class="unit-picker-name">${data.name}</div>
                    <div class="unit-picker-stats">${isEnemy ? '' : `MP: ${u.movesLeft} | `}Güç: ${data.duel}⚔️</div>
                </div>
            `;
            
            if (canSelect) {
                item.onclick = (e) => {
                    e.stopPropagation();
                    picker.classList.remove('active');
                    onSelect(u);
                };
            } else {
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.showNotice("Hareket puanı bitti!", "warning");
                };
            }
            picker.appendChild(item);
        });

        // Pozisyon ayarla (Ekran sınırlarına çarpmaması için basit kontrol)
        let left = clientX + 20;
        let top = clientY - 30;
        
        if (left + 180 > window.innerWidth) left = clientX - 190;
        if (top + 200 > window.innerHeight) top = clientY - 150;

        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
        picker.classList.add('active');
        
        // Dışarı tıklayınca kapansın
        const closePicker = (e) => {
            if (!picker.contains(e.target)) {
                picker.classList.remove('active');
                window.removeEventListener('mousedown', closePicker);
            }
        };
        setTimeout(() => window.addEventListener('mousedown', closePicker), 10);
    }

    showChoiceModal(type, level) {
        this.choiceModalOpen = true;
        const bName = BUILDING_NAMES[type];
        const bonuses = BUILDING_BONUSES[type][level];

        const items = bonuses.map((desc, i) => {
            const letter = String.fromCharCode(65 + i); // A, B, C...
            const icons = ['🌟', '🔥', '🛡️', '⚡', '💎'];
            return {
                id: letter,
                name: `Seçenek (${letter})`,
                desc: desc,
                enabled: true,
                icon: icons[i] || '✨',
                costStr: ''
            };
        });

        this.showChoiceModalWithDesc(`${bName} - ${level}. Seviye Bonusu Seçimi`, items, (choice) => {
            this.actions.chooseBonus(this.state.currentPlayer.id, type, level, choice);
            this.state.currentPlayer.pendingChoices.shift();
            this.choiceModalOpen = false;
            this.update();
        });
    }

    showChoiceModalWithDesc(title, items, onSelect) {
        this.els.choiceTitle.textContent = title;
        this.els.choiceGrid.innerHTML = '';

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = `choice-item ${item.enabled ? 'enabled' : 'disabled'}`;
            div.innerHTML = `
                <div class="icon">${item.icon}</div>
                <div class="name">${item.name}</div>
                <div class="desc">${item.desc || ''}</div>
                <div class="cost">${item.costStr}</div>
            `;
            if (item.enabled) {
                div.onclick = (e) => {
                    e.stopPropagation(); // Window'daki handleClick'i tetiklemesin
                    this.els.choiceModal.classList.remove('active');
                    onSelect(item.id);
                };
            } else {
                div.onclick = (e) => {
                    e.stopPropagation();
                    this.showNotice(item.error || "Yeterli kaynak yok!", "danger");
                };
            }
            this.els.choiceGrid.appendChild(div);
        });
        this.els.choiceModal.classList.add('active');
    }

    showBuildingChoice() {
        const p = this.state.currentPlayer;
        const items = ALL_BUILDINGS.map(bType => {
            const cost = BUILD_COSTS[bType];
            let canAfford = true;
            let missing = [];
            for (const [res, amt] of Object.entries(cost)) {
                if ((p.resources[res] || 0) < amt) {
                    canAfford = false;
                    missing.push(`${RESOURCE_INFO[res].name}`);
                }
            }

            const playerBuilt = p.buildings?.[bType] || 0;
            const level = playerBuilt >= 4 ? 3 : playerBuilt >= 2 ? 2 : playerBuilt >= 1 ? 1 : 0;
            const nextLevel = level + 1;
            const nextBonuses = BUILDING_BONUSES[bType]?.[nextLevel] || BUILDING_BONUSES[bType]?.[1] || [];

            return {
                id: bType,
                name: BUILDING_NAMES[bType] + (level > 0 ? ` (Sv.${level}→${nextLevel})` : ' (Yeni)'),
                icon: BUILDING_ICONS[bType] || '🏗️',
                costStr: Object.entries(cost).map(([r, a]) => `${RESOURCE_INFO[r]?.emoji || ''}${a}`).join(' '),
                enabled: canAfford,
                desc: nextBonuses.join(' | '),
                error: canAfford ? "" : `Eksik: ${missing.join(", ")}`
            };
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
            const hasGold = (p.resources.gold || 0) >= (data.gold || 0);
            const hasPop = p.units.length < p.maxPopulation;
            let canBuild = hasGold && hasPop;
            let error = "";

            // Fix check for siege
            const siegeAllowed = p.bonusState?.canBuildSiege || p.buildingCounts?.muhendishane >= 1;

            if (data.cls === 'kusatma' && !siegeAllowed) {
                canBuild = false;
                error = "Kuşatma birimi için Mühendishane gerekir!";
            } else if (!hasGold) {
                error = `Yetersiz Altın! (${p.resources.gold}/${data.gold})`;
            } else if (!hasPop) {
                error = "Nüfus kapasitesi dolu!";
            }

            return {
                id,
                name: data.name,
                icon: data.img ? `<img src="${data.img}" style="width:50px;height:50px;object-fit:contain;">` : (data.emoji || '👤'),
                desc: `${data.duel}⚔️ | ${data.speed}🏃 | ${data.range}🎯`,
                costStr: `💰 ${data.gold} Altın`,
                enabled: canBuild,
                error
            };
        });

        this.showChoiceModalWithDesc("Üretilecek Asker Seçin", items, (uType) => {
            this.state.actionMode = 'trainUnit';
            this.state.selectedUnitType = uType;
            this.showNotice("Askeri yerleştirmek için bir YERLEŞİM düğmesine tıklayın.", "info");
            p.settlements.forEach(hid => {
                const hex = this.state.grid.hexes.get(hid);
                if (hex) hex.nodeIds.forEach(nid => this.state.highlightedNodes.add(nid));
            });
            this.update();
        });
    }

    showCombatReport(data) {
        const modal = document.getElementById('combatModal');
        if (!modal) return;
        document.getElementById('combatAttackerName').textContent = data.attacker.player.name;
        document.getElementById('combatAttackerName').style.color = data.attacker.player.color;
        
        const attackerUnitData = UNIT_DATA[data.attacker.unit.type];
        const defenderUnitData = UNIT_DATA[data.defender.unit.type];

        if (attackerUnitData?.img) {
            document.getElementById('combatAttackerEmoji').innerHTML = `<img src="${attackerUnitData.img}" style="width:60px;height:60px;object-fit:contain;">`;
        } else {
            document.getElementById('combatAttackerEmoji').textContent = attackerUnitData?.emoji || '⚔️';
        }

        document.getElementById('combatDefenderName').textContent = data.defender.player.name;
        document.getElementById('combatDefenderName').style.color = data.defender.player.color;

        if (defenderUnitData?.img) {
            document.getElementById('combatDefenderEmoji').innerHTML = `<img src="${defenderUnitData.img}" style="width:60px;height:60px;object-fit:contain;">`;
        } else {
            document.getElementById('combatDefenderEmoji').textContent = defenderUnitData?.emoji || '🛡️';
        }

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
        this.showChoiceModalWithDesc("Ticaret Türü", [
            { id: 'bank', name: 'Banka Ticareti', icon: '🏦', enabled: true, costStr: '', desc: 'Sistemle takas yap (6:1 vs)' },
            { id: 'player', name: 'Oyuncu Ticareti', icon: '🤝', enabled: true, costStr: '', desc: 'Diğer oyunculara teklif sun' }
        ], (choice) => {
            if (choice === 'bank') {
                if (this.els.tradeModal) this.els.tradeModal.classList.add('active');
            } else {
                this.showPlayerTradeModal();
            }
        });
    }

    showPlayerTradeModal() {
        const modal = document.getElementById('playerTradeModal');
        const select = document.getElementById('ptTargetPlayer');
        const offerGrid = document.getElementById('ptOfferGrid');
        const requestGrid = document.getElementById('ptRequestGrid');
        if (!modal || !select || !offerGrid || !requestGrid) return;

        // Hedef oyuncuları doldur
        select.innerHTML = '';
        this.state.players.forEach(p => {
            if (p.id !== this.state.currentPlayer.id) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            }
        });

        const resKeys = ['besin', 'odun', 'tas', 'kil', 'maden', 'gold'];
        const resIcons = { besin: '🌾', odun: '🪵', tas: '🪨', kil: '🧱', maden: '⚙️', gold: '💰' };

        offerGrid.innerHTML = '';
        requestGrid.innerHTML = '';

        resKeys.forEach(r => {
            offerGrid.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:0.8rem;">${resIcons[r]} ${r.toUpperCase()}</span>
                    <input type="number" id="ptOffer_${r}" class="input-style" value="0" min="0" style="width:50px; padding:2px; height:24px;">
                </div>`;
            requestGrid.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:0.8rem;">${resIcons[r]} ${r.toUpperCase()}</span>
                    <input type="number" id="ptReq_${r}" class="input-style" value="0" min="0" style="width:50px; padding:2px; height:24px;">
                </div>`;
        });

        document.getElementById('btnConfirmPlayerTrade').onclick = () => this.handleConfirmPlayerTrade();
        modal.classList.add('active');
    }

    handleConfirmPlayerTrade() {
        const targetId = parseInt(document.getElementById('ptTargetPlayer').value);
        const offer = {};
        const request = {};
        const resKeys = ['besin', 'odun', 'tas', 'kil', 'maden', 'gold'];

        let offerTotal = 0;
        let reqTotal = 0;
        resKeys.forEach(r => {
            offer[r] = parseInt(document.getElementById(`ptOffer_${r}`).value) || 0;
            request[r] = parseInt(document.getElementById(`ptReq_${r}`).value) || 0;
            offerTotal += offer[r];
            reqTotal += request[r];
        });

        if (offerTotal === 0 && reqTotal === 0) {
            this.showNotice("Lütfen geçerli bir teklif girin.", "warning");
            return;
        }

        const targetP = this.state.players.find(p => p.id === targetId);
        if (targetP.isAI) {
            // Basit AI kabul mantığı: Sadece kârlıysa (istediği verdiğinden az/eşitse) kabul etsin
            if (offerTotal >= reqTotal) {
                if (this.actions.tradeWithPlayer(this.state.currentPlayer.id, targetId, offer, request)) {
                    this.showNotice(`${targetP.name} teklifinizi KABUL ETTİ!`, "success");
                    document.getElementById('playerTradeModal').classList.remove('active');
                    this.update();
                } else {
                    this.showNotice("Yetersiz kaynaklar!", "danger");
                }
            } else {
                this.showNotice(`${targetP.name} teklifinizi REDDETTİ!`, "danger");
            }
        } else {
            // İnsan oyuncu için confirm
            if (confirm(`${targetP.name}, ${this.state.currentPlayer.name} size bir ticaret teklif ediyor.\nKabul ediyor musunuz?`)) {
                if (this.actions.tradeWithPlayer(this.state.currentPlayer.id, targetId, offer, request)) {
                    this.showNotice("Ticaret gerçekleştirildi!", "success");
                    document.getElementById('playerTradeModal').classList.remove('active');
                    this.update();
                } else {
                    this.showNotice("Bir tarafta yeterli kaynak yok!", "danger");
                }
            } else {
                this.showNotice("Teklif reddedildi.", "warning");
            }
        }
    }

    handleConfirmTrade() {
        const p = this.state.currentPlayer;
        const sellType = this.els.tradeSellType?.value;
        const buyType = this.els.tradeBuyType?.value;
        const buyType2 = this.els.tradeBuyType2?.value;
        const amount = parseInt(this.els.tradeAmount?.value);
        if (!sellType || !buyType || isNaN(amount) || amount <= 0) return;

        const ok = this.actions.tradeWithBank(p.id, sellType, buyType, (sellType === 'gold' ? buyType2 : null));
        if (ok) {
            this.els.tradeModal.classList.remove('active');
            this.showNotice("Takas başarılı!", "success");
            this.update();
        } else {
            this.showNotice("Takas gerçekleştirilemedi! (Yetersiz kaynak)", "danger");
        }
    }

    showCombatAnimation(obj, emoji) {
        const el = document.createElement('div');
        el.className = 'combat-anim';
        el.textContent = emoji;
        const rect = this.renderer.canvas.getBoundingClientRect();
        const sx = obj.x * this.renderer.scale + this.renderer.offsetX + rect.left;
        const sy = obj.y * this.renderer.scale + this.renderer.offsetY + rect.top;
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    showCombatReport(res) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const aUnit = res.attacker.unit;
        const dUnit = res.defender.unit;
        const aP = res.attacker.player;
        const dP = res.defender.player;

        let resultText = "DÜELLO BERABERE!";
        if (res.winner === 'attacker') resultText = `${aP.name.toUpperCase()} KAZANDI!`;
        if (res.winner === 'defender') resultText = `${dP.name.toUpperCase()} KAZANDI!`;

        overlay.innerHTML = `
            <div class="combat-modal">
                <h2 style="text-align:center; margin-bottom:10px;">${res.type === 'range' ? '🏹 MENZİLLİ SALDIRI' : '⚔️ MEYDAN SAVAŞI'}</h2>
                <div class="combat-vs">
                    <div class="combat-unit-card" style="border-color:${aP.color}">
                        <div style="flex:1;">
                            <div style="font-weight:bold; color:#FFCDD2;">${aP.name}</div>
                            <div style="margin:10px 0;">
                                ${UNIT_DATA[aUnit.type].img ? `<img src="${UNIT_DATA[aUnit.type].img}" style="width:60px;height:60px;object-fit:contain;">` : `<span style="font-size:3rem;">${UNIT_DATA[aUnit.type].emoji}</span>`}
                            </div>
                            <div style="font-size:1.2rem; font-weight:bold;">Güç: ${res.attacker.str}</div>
                        </div>
                        <div class="combat-dice-box">
                             ${res.attacker.rolls ? res.attacker.rolls.map(v => `<div class="combat-die">${v}</div>`).join('') : ''}
                        </div>
                    </div>
                    
                    <div style="font-size:2.5rem; font-family:var(--font-heading); color:var(--text-muted)">VS</div>
                    
                    <div class="combat-unit-card" style="border-color:${dP.color}">
                        <h3>${dP.name}</h3>
                        <div style="font-size:3rem; margin:10px 0;">${UNIT_DATA[dUnit.type].emoji}</div>
                        <div style="font-weight:bold;">${UNIT_DATA[dUnit.type].name}</div>
                        <div class="combat-dice-box">
                             ${res.defender.rolls ? res.defender.rolls.map(v => `<div class="combat-die">${v}</div>`).join('') : ''}
                        </div>
                        <div style="margin-top:15px; font-size:1.2rem; font-weight:bold; color:var(--gold)">Toplam: ${res.defender.str}</div>
                    </div>
                </div>
                
                <div class="combat-result-text" style="color:${res.winner === 'attacker' ? aP.color : (res.winner === 'defender' ? dP.color : 'white')}">${resultText}</div>
                
                <button class="combat-close-btn">TAMAM</button>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('.combat-close-btn').onclick = () => overlay.remove();
    }

    showBiomeDetail(hex, x, y) {
        if (!this.els.biomeCard) return;
        const info = BIOME_INFO[hex.biome];
        if (!info) return;

        this.els.biomeName.textContent = info.name;
        this.els.biomeBody.innerHTML = `
            <div style="margin-bottom: 8px;">Zar Numarası: <b>${hex.number || '-'}</b></div>
            <div>Üretilen Kaynaklar:</div>
            <div style="display: flex; gap: 4px; margin-top: 4px;">
                ${hex.resources.map(r => `<span title="${RESOURCE_INFO[r]?.name}">${RESOURCE_INFO[r]?.emoji}</span>`).join(' ')}
            </div>
            ${hex.settlement ? `<div style="margin-top:8px; color:var(--gold);">🏗️ Yerleşim: ${this.state.players.find(p => p.id === hex.settlement.playerId)?.name}</div>` : ''}
        `;

        this.els.biomeCard.style.left = `${x + 15}px`;
        this.els.biomeCard.style.top = `${y + 15}px`;
        this.els.biomeCard.classList.add('active');
    }

    hideBiomeDetail() {
        if (this.els.biomeCard) this.els.biomeCard.classList.remove('active');
    }

    _updateMovementHighlights(nodeId, unit) {
        this.state.highlightedNodes.clear();
        this.state.rangeHighlightedNodes = new Set(); // Yeni: Menzil vurgusu
        const nodeObj = this.state.grid.nodes.get(nodeId);
        const udata = UNIT_DATA[unit.type];

        nodeObj.adjacentNodes.forEach(nid => {
            const targetNode = this.state.grid.nodes.get(nid);

            // Hareket vurgusu
            const edgeId = this.state.grid.getEdgeBetweenNodes(nodeId, nid);
            const edge = this.state.grid.edges.get(edgeId);
            let cost = 1.0;
            if (edge && edge.road === this.state.currentPlayer.id && udata.cls !== 'kusatma') {
                cost = 0.5;
            }
            if (unit.movesLeft >= cost) {
                this.state.highlightedNodes.add(nid);
            }

            // Menzil vurgusu (Eğer düşman varsa)
            if (udata.range > 0 && targetNode.army && targetNode.army.playerId !== this.state.currentPlayer.id) {
                this.state.rangeHighlightedNodes.add(nid);
            }
        });
    }

    showResourceAnimation(gainedList) {
        if (!gainedList || gainedList.length === 0) return;

        // Her kazanım için küçük bir gecikmeyle ikonları uçur
        gainedList.forEach((item, index) => {
            setTimeout(() => {
                const resInfo = RESOURCE_INFO[item.res];
                if (!resInfo) return;

                // 1. Başlangıç noktası (Canvas üzerindeki koordinatlar)
                const startPos = this.renderer.gameToCanvas(item.x, item.y);

                // 2. Hedef nokta (Üst bardaki ilgili kaynak elementi)
                const targetElId = `res${item.res.charAt(0).toUpperCase() + item.res.slice(1)}`;
                const targetEl = document.getElementById(targetElId);
                if (!targetEl) return;
                const targetRect = targetEl.getBoundingClientRect();

                // 3. Animasyon elemanını oluştur
                const el = document.createElement('div');
                el.className = 'resource-fly-icon';
                el.innerHTML = resInfo.emoji;
                el.style.left = `${startPos.x}px`;
                el.style.top = `${startPos.y}px`;
                el.style.color = resInfo.color;
                document.body.appendChild(el);

                // 4. Hedefe uçur
                const flyX = targetRect.left + targetRect.width / 2 - 10;
                const flyY = targetRect.top + targetRect.height / 2 - 10;

                el.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 0 },
                    { transform: 'translate(0, 0) scale(1.5)', opacity: 1, offset: 0.2 },
                    { transform: `translate(${flyX - startPos.x}px, ${flyY - startPos.y}px) scale(0.5)`, opacity: 0.8 }
                ], {
                    duration: 800,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    fill: 'forwards'
                }).onfinish = () => {
                    el.remove();
                    // Hedef elemente küçük bir parlama efekti ver
                    targetEl.classList.add('res-gain-pulse');
                    setTimeout(() => targetEl.classList.remove('res-gain-pulse'), 400);
                };

            }, index * 100); // İkonlar sırayla çıksın
        });
    }
}
