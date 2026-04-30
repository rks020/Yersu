'use strict';
// ============================================================
// UI — Arayüz etkileşimlerini yönetir
// ============================================================

const SVG_NS = 'http://www.w3.org/2000/svg';
let arrowAnimId = null;
let trailTimeouts = [];

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
            choiceModalCloseBtn: document.getElementById('btnChoiceModalClose'),
            
            nodeTooltip: document.getElementById('node-tooltip'),
            combatModal: document.getElementById('combat-modal'),
            combatAtkFrame: document.getElementById('atk-frame'),
            combatDefFrame: document.getElementById('def-frame'),
            combatAtkPower: document.getElementById('atk-power'),
            combatDefPower: document.getElementById('def-power'),
            combatResultText: document.getElementById('combat-result-text'),
            btnCloseCombat: document.getElementById('btn-close-combat')
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
        canvas.addEventListener('mouseleave', () => {
            this.hideBiomeDetail();
            this.hideNodeTooltip();
        });

        if (this.els.btnCloseCombat) {
            this.els.btnCloseCombat.onclick = () => {
                this.els.combatModal.classList.remove('active');
            };
        }

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
            const p = this.state.currentPlayer;

            // Yapı inşa edilebilir mi kontrol et (Kaynaklar ve yerleşim sahipliği)
            if (!this.actions.canBuildBuilding(p.id, clickedHex.id, bType)) {
                this.showNotice("Bu yapıyı buraya inşa edemezsiniz veya kaynak yetersiz!", "danger");
                this.state.clearSelection();
                this.update();
                return;
            }

            // Bu inşa bir seçim/bonus tetikleyecek mi?
            const currentCount = p.buildings[bType] || 0;
            const getLv = (c) => (c >= 4 ? 3 : (c >= 2 ? 2 : (c >= 1 ? 1 : 0)));
            const oldLv = getLv(currentCount);
            const newLv = getLv(currentCount + 1);

            if (newLv > oldLv) {
                const bonusInfo = BUILDING_BONUSES[bType][newLv];
                if (Array.isArray(bonusInfo) && bonusInfo.length > 1) {
                    const alreadyChosen = p.chosenBonuses && p.chosenBonuses[bType] && p.chosenBonuses[bType][newLv];
                    if (!alreadyChosen) {
                        // Seçim yapılması gerekiyor - İnşa etmeden önce sor
                        this.showChoiceModal(bType, newLv, (choice) => {
                            // Bonus seçildi -> İnşayı tamamla
                            if (this.actions.buildBuilding(p.id, clickedHex.id, bType)) {
                                this.actions.chooseBonus(p.id, bType, newLv, choice);
                                // recalcBuildings tarafından eklenen pendingChoice varsa temizle
                                p.pendingChoices = p.pendingChoices.filter(c => !(c.type === bType && c.level === newLv));
                                this.showNotice(`${BUILDING_NAMES[bType]} inşa edildi!`, "success");
                            }
                            this.state.clearSelection();
                            this.update();
                        }, () => {
                            // Kapat'a basıldı -> İptal et
                            this.showNotice("Yapı kurulumu iptal edildi", "warning");
                            this.state.clearSelection();
                            this.update();
                        });
                        return;
                    }
                }
            }

            // Normal inşa
            if (this.actions.buildBuilding(p.id, clickedHex.id, bType)) {
                this.showNotice(`${BUILDING_NAMES[bType]} inşa edildi!`, "success");
            } else {
                this.showNotice("Bu yapıyı buraya inşa edemezsiniz!", "danger");
            }
            this.state.clearSelection();
            this.update();
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
            this.update();
        }

        // ── ASKER SEÇİMİ (HAREKET/SALDIRI İÇİN) ──
        else if (mode === 'selectUnitForMove' && clickedNode) {
            const hasMyUnit = clickedNode.army && clickedNode.army.units.some(u => {
                const ownerId = u.playerId !== undefined ? u.playerId : clickedNode.army.playerId;
                return String(ownerId) === String(current.id);
            });

            if (hasMyUnit) {
                const selectUnit = (unit) => {
                    const udata = UNIT_DATA[unit.type];
                    
                    let canAct = false;
                    if (this.state.subPhase === 'move') {
                        canAct = unit.movesLeft > 0;
                    } else if (this.state.subPhase === 'attack') {
                        canAct = !unit.hasAttacked; 
                    }

                    if (!canAct) {
                        this.showNotice("Bu birim bu tur yapabileceği her şeyi yaptı!", "warning");
                        return;
                    }

                    this.state.selectedUnit = unit;
                    this.state.selectedUnitNode = clickedNode.id;
                    this.state.actionMode = 'moveOrAttack';
                    
                    if (this.state.subPhase === 'move') {
                        this._updateMovementHighlights(clickedNode.id, unit);
                        this.showNotice("Hareket etmek için HEDEF DÜĞME'ye tıklayın.", "info");
                    } else if (this.state.subPhase === 'attack') {
                        this.state.highlightedNodes.clear();
                        this.state.rangeHighlightedNodes.clear();
                        const dist = Math.max(1, udata.range || 0); 
                        this.state.grid.nodes.forEach(n => {
                            const d = this.state.grid.getDistance(clickedNode.id, n.id);
                            if (d >= 0 && d <= dist) this.state.rangeHighlightedNodes.add(n.id);
                        });
                        this.showNotice("Saldırmak için menzilindeki bir DÜŞMAN'a tıklayın.", "info");
                    }
                    this.update();
                };

                const myUnits = clickedNode.army.units.filter(u => String(u.playerId !== undefined ? u.playerId : clickedNode.army.playerId) === String(current.id));
                if (myUnits.length > 1) {
                    this.showUnitSelectionModal(clickedNode, selectUnit, clientX, clientY);
                } else {
                    selectUnit(myUnits[0]);
                }
            } else {
                this.state.clearSelection();
                this.update();
            }
        }
        // ── HAREKET VEYA SALDIRI UYGULAMA ──
        else if (mode === 'moveOrAttack' && clickedNode) {
            const unit = this.state.selectedUnit;
            const sourceNodeId = this.state.selectedUnitNode;
            const udata = UNIT_DATA[unit.type];

            if (clickedNode.id === sourceNodeId) {
                // Eğer aynı nodeda düşman varsa tıklama saldırı tetiklemeli, yoksa iptal etmeli
                const hasEnemyOnSameNode = clickedNode.army && clickedNode.army.units.some(u => {
                    const ownerId = u.playerId !== undefined ? u.playerId : clickedNode.army.playerId;
                    return String(ownerId) !== String(current.id);
                });
                
                if (!hasEnemyOnSameNode) {
                    this.state.clearSelection();
                    this.update();
                    return;
                }
            }

            const executeAction = (targetUnitUid = null) => {
                // SALDIRI AŞAMASI: Sadece saldırı eylemi
                if (this.state.subPhase === 'attack') {
                    const hasEnemy = clickedNode.army && clickedNode.army.units.some(u => {
                        const ownerId = u.playerId !== undefined ? u.playerId : clickedNode.army.playerId;
                        return String(ownerId) !== String(current.id);
                    });

                    if (hasEnemy) {
                        const res = this.actions.performAttack(current.id, unit.uid, clickedNode.id, targetUnitUid);
                        if (res) {
                            const sourceNode = this.state.grid.nodes.get(sourceNodeId);
                            this.showCombatAnimation(sourceNode, clickedNode, res);
                            this.showCombatVS(res);
                            this.state.clearSelection();
                            this.update();
                        }
                        return;
                    } else {
                        this.showNotice("Saldırı aşamasında sadece düşmana saldırabilirsiniz!", "warning");
                        return;
                    }
                }

                // HAREKET AŞAMASI: Sadece hareket eylemi
                // Artık düşman nodunun içine girmek serbest olduğu için kontrolü kaldırıyoruz.


                const res = this.actions.moveUnit(current.id, unit.uid, clickedNode.id, targetUnitUid);
                if (res) {
                    if (res.type === 'move') {
                        this.showNotice("Birim hareket etti.", "info");
                    } else {
                        const sourceNode = this.state.grid.nodes.get(sourceNodeId);
                        this.showCombatAnimation(sourceNode, clickedNode, res);
                        this.showCombatVS(res);
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
            if (clickedNode.army && String(clickedNode.army.playerId) !== String(current.id) && clickedNode.army.units.length > 1) {
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
                // OTOMATİK SEÇİM: Hareket veya Saldırı aşamasındaysak ve kendi birimimizse
                const hasMyUnit = clickedNode.army && clickedNode.army.units.some(u => {
                    const ownerId = u.playerId !== undefined ? u.playerId : clickedNode.army.playerId;
                    return String(ownerId) === String(current.id);
                });

                if ((this.state.subPhase === 'move' || this.state.subPhase === 'attack') && hasMyUnit) {
                    const selectUnit = (unit) => {
                        // Birimin sahibi kontrolü (Yeni sistemde birim bazlı sahiplik var)
                        const ownerId = unit.playerId !== undefined ? unit.playerId : clickedNode.army.playerId;
                        if (String(ownerId) !== String(current.id)) return; // Kendi birimimiz değilse seçme

                        const udata = UNIT_DATA[unit.type];
                        let canAct = false;
                        if (this.state.subPhase === 'move') {
                            canAct = unit.movesLeft > 0;
                        } else {
                            canAct = !unit.hasAttacked;
                        }

                        if (canAct) {
                            this.state.selectedUnit = unit;
                            this.state.selectedUnitNode = clickedNode.id;
                            this.state.actionMode = 'moveOrAttack';
                            
                            if (this.state.subPhase === 'move') {
                                this._updateMovementHighlights(clickedNode.id, unit);
                                this.showNotice(`${udata.name} seçildi. Hareket etmek için hedef noktaya tıklayın.`, "info");
                            } else {
                                // Saldırı aşamasında hareket kutucuklarını (mavi) temizle
                                this.state.highlightedNodes.clear();
                                
                                // Menzilini göster (Sadece birimin gerçek menzilini gösterir)
                                this.state.rangeHighlightedNodes.clear();
                                const dist = udata.range || 0;
                                this.state.grid.nodes.forEach(n => {
                                    const d = this.state.grid.getDistance(clickedNode.id, n.id);
                                    if (d >= 0 && d <= dist) this.state.rangeHighlightedNodes.add(n.id);
                                });
                                this.showNotice(`${udata.name} seçildi. Saldırmak için menzilindeki (yakın/uzak) bir düşmana tıklayın.`, "info");
                            }
                        } else {
                            this.showNotice("Bu birim bu aşamada yapabileceği her şeyi yaptı!", "warning");
                        }
                        this.update();
                    };

                    const myUnits = clickedNode.army.units.filter(u => {
                        const ownerId = u.playerId !== undefined ? u.playerId : clickedNode.army.playerId;
                        return String(ownerId) === String(current.id);
                    });

                    if (myUnits.length > 1) {
                        this.showUnitSelectionModal(clickedNode, selectUnit, clientX, clientY);
                        return; 
                    } else if (myUnits.length === 1) {
                        selectUnit(myUnits[0]);
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
            this.hideNodeTooltip();
            return;
        }

        const { x: gx, y: gy } = this.renderer.canvasToGame(px, py);
        
        // 1. Önce Node Kontrolü (Birim Listesi için)
        let foundNode = null;
        for (const node of this.state.grid.nodes.values()) {
            const d = Math.sqrt((gx - node.x)**2 + (gy - node.y)**2);
            if (d < 25) {
                foundNode = node;
                break;
            }
        }

        if (foundNode && foundNode.army && foundNode.army.units.length > 0) {
            this.showNodeTooltip(foundNode, clientX, clientY);
            this.hideBiomeDetail();
            return;
        } else {
            this.hideNodeTooltip();
        }

        const hex = this.state.grid.pixelToNearestHex(gx, gy);
        if (hex) {
            const dist = Math.sqrt((gx - hex.center.x) ** 2 + (gy - hex.center.y) ** 2);
            if (dist < 60) {
                this.showBiomeDetail(hex, clientX, clientY);
            } else {
                this.hideBiomeDetail();
            }
        } else {
            this.hideBiomeDetail();
        }
    }

    showNodeTooltip(node, clientX, clientY) {
        const tooltip = this.els.nodeTooltip;
        if (!tooltip) return;

        // Oyuncu bazlı grupla
        const groups = {};
        node.army.units.forEach(u => {
            const pid = u.playerId !== undefined ? u.playerId : node.army.playerId;
            if (!groups[pid]) groups[pid] = [];
            groups[pid].push(u);
        });

        const pIds = Object.keys(groups);
        let html = '';

        pIds.forEach(pid => {
            const player = this.state.players.find(p => String(p.id) === String(pid));
            const name = player ? player.name : 'Bilinmeyen';
            const color = player ? (player.color || player.hex) : '#ccc';
            
            html += `
                <div class="tooltip-col">
                    <div class="tooltip-col-title" style="color:${color}">${name}</div>
                    ${groups[pid].map(u => {
                        const data = UNIT_DATA[u.type];
                        const icon = data.img ? `<img src="${data.img}">` : `<span>${data.emoji || '👤'}</span>`;
                        return `
                            <div class="tooltip-unit-item">
                                ${icon}
                                <span class="unit-name">${data.name}</span>
                                <span class="unit-stat">${u.hp}❤️</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        });

        tooltip.innerHTML = html;
        tooltip.style.left = `${clientX + 15}px`;
        tooltip.style.top = `${clientY + 15}px`;
        tooltip.classList.add('active');
    }

    hideNodeTooltip() {
        if (this.els.nodeTooltip) this.els.nodeTooltip.classList.remove('active');
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
                    this.showNotice("Taşımak istediğiniz BİRİM'i seçin.", "info");
                    p.units.forEach(u => this.state.highlightedNodes.add(u.nodeId));
                    break;
                case 'attack_unit':
                    this.state.actionMode = 'selectUnitForMove';
                    this.showNotice("Saldırmak istediğiniz BİRİM'i seçin.", "info");
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
        if (this.state.subPhase === 'move') {
            this.state.transitionToAttack();
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

        this.checkKervansarayBonus();
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

    checkKervansarayBonus() {
        const modal = document.getElementById('kervansarayModal');
        if (!modal) return;

        // Bulunan ilk pendingKervansarayRes > 0 olan gerçek oyuncuyu bul
        const p = this.state.players.find(pl => pl.bonusState && pl.bonusState.pendingKervansarayRes > 0);
        if (p && !p.isAI) {
            document.getElementById('kervansarayPlayerName').textContent = p.name;
            document.getElementById('kervansarayResCount').textContent = p.bonusState.pendingKervansarayRes;
            modal.classList.add('active');
            this.kervansarayActivePlayer = p.id;
        } else if (p && p.isAI) {
            // AI ise tüm bekleyenleri rastgele seçsin
            while (p.bonusState.pendingKervansarayRes > 0) {
                const basicRes = ['besin', 'odun', 'tas', 'kil', 'maden'];
                const randomRes = basicRes[Math.floor(Math.random() * basicRes.length)];
                p.gain(randomRes, 1);
                p.bonusState.pendingKervansarayRes--;
                this.state.addLog(`🐪 AI ${p.name}, Kervansaray bonusu olarak 1 ${RESOURCE_INFO[randomRes].name} aldı.`, 'success');
            }
            this.update(); // Değişiklikleri yansıt
        } else {
            modal.classList.remove('active');
            this.kervansarayActivePlayer = null;
        }
    }

    selectKervansarayRes(res) {
        if (this.kervansarayActivePlayer !== null) {
            const p = this.state.players.find(pl => pl.id === this.kervansarayActivePlayer);
            if (p && p.bonusState.pendingKervansarayRes > 0) {
                p.gain(res, 1);
                p.bonusState.pendingKervansarayRes--;
                this.state.addLog(`🐪 ${p.name}, Kervansaray bonusu olarak 1 ${RESOURCE_INFO[res].name} aldı.`, 'success');
                this.update();
            }
        }
    }

    showChangeResourceModal(hexId) {
        const modal = document.getElementById('changeBiomeModal');
        if (!modal) return;
        document.getElementById('changeBiomeHexId').value = hexId;
        modal.classList.add('active');
    }

    confirmChangeResource(res) {
        const hexId = document.getElementById('changeBiomeHexId').value;
        const modal = document.getElementById('changeBiomeModal');
        if (hexId && res) {
            const success = this.actions.changeHexResource(this.state.currentPlayer.id, hexId, res);
            if (success) {
                this.showNotice("Biyom kaynağı başarıyla değiştirildi!", "success");
                modal.classList.remove('active');
                this.update();
            } else {
                this.showNotice("Kaynak değiştirilemedi!", "danger");
            }
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
                (this.state.subPhase === 'move') ? 'Hareket' : 
                    (this.state.subPhase === 'attack') ? 'Saldırı' : 'Eylem';

        if (this.els.turnIndicator) {
            this.els.turnIndicator.innerHTML = `Tur ${this.state.turn} — <span style="color:${p.color}">${p.name}</span> (${sub})`;
        }
        if (this.els.rollDiceBtn) this.els.rollDiceBtn.disabled = (this.state.subPhase !== 'production' || p.isAI);
        if (this.els.endTurnBtn) {
            this.els.endTurnBtn.disabled = (this.state.subPhase === 'production' || p.isAI);
            let btnText = '🏁 Turu Bitir';
            if (this.state.subPhase === 'build') btnText = '⏭ Hareket Aşaması';
            else if (this.state.subPhase === 'move') btnText = '⏭ Saldırı Aşaması';
            this.els.endTurnBtn.textContent = btnText;
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
                let cost = { ...BUILD_COSTS[b] };
                if (b === 'ciftlik' && p.bonusState.ciftlikFixedCost) {
                    cost = { besin: 6 };
                }

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
            } else if (action === 'attack_unit') {
                btn.disabled = !isTurn || sub !== 'attack';
            } else if (action === 'train_unit' || action === 'trade') {
                btn.disabled = !isTurn || !isMain || sub !== 'build';
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
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#666;font-size:0.78rem;">Henüz birim yok</td></tr>';
            return;
        }

        // Tip bazında grupla
        const grouped = {};
        p.units.forEach(u => { if (!grouped[u.type]) grouped[u.type] = []; grouped[u.type].push(u); });

        let html = '';
        for (const [type, units] of Object.entries(grouped)) {
            const data = UNIT_DATA[type];
            if (!data) continue;

            // Özel Bonuslar
            const specialParts = [];
            if (data.special === 'anti_cavalry') specialParts.push('+1 vs Süvari');
            if (data.special === 'anti_infantry') specialParts.push('+1 vs Piyade');
            if (data.special === 'multi_2') specialParts.push('Çift Hedef');
            if (data.special === 'no_attack') specialParts.push('Saldıramaz');

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

            const hasRangeBonus = p.bonusState && p.bonusState.topcuRangeBonus;
            if (hasRangeBonus && data.range > 0) bldParts.push('Mühendishane: Menzil +1');

            // Toplam değerler
            const muhCount = p.buildings?.['muhendishane'] || 0;
            const muhLv = muhCount >= 4 ? 3 : muhCount >= 2 ? 2 : muhCount >= 1 ? 1 : 0;
            
            const totalRange = data.range > 0 ? (data.range + (hasRangeBonus ? 1 : 0)) : 0;
            
            let speedBonus = 0;
            if (kislaLv >= 2 && p.chosenBonuses?.kisla?.[2] === 'A') {
                if (type === 'hafif_suvari' || type === 'atli_okcu') speedBonus = 1;
            }
            const totalSpeed = data.speed + speedBonus;
            
            let yolSpeed = totalSpeed;
            if (data.cls !== 'kusatma') {
                const roadCost = data.speed / (data.speed + 1);
                yolSpeed = Math.floor(totalSpeed / roadCost);
            }

            const totalDuel = data.duel + duelBonus;
            const totalSiege = data.siege; // Kuşatma zarı bonusu şu an sadece tapınak (o da savunmada)

            const totalParts = [];
            if (totalDuel !== 0) totalParts.push(`Düello ${totalDuel > 0 ? '+' : ''}${totalDuel}`);
            if (totalRange > 0) totalParts.push(`Menzil ${totalRange}`);
            if (totalSiege > 0) totalParts.push(`Kuşatma +${totalSiege}`);



            html += `
            <tr>
                <td><div class="mil-unit-cell">
                    <span class="mil-unit-emoji">${data.img ? `<img src="${data.img}" style="width:24px;height:24px;vertical-align:middle;object-fit:contain;">` : (data.emoji || '👤')}</span>
                    <span class="mil-unit-name">${data.name}</span>
                </div></td>
                <td class="mil-count">${units.length}</td>
                <td class="mil-range">${totalRange || '-'}</td>
                <td class="mil-speed">${totalSpeed}</td>
                <td class="mil-speed-road">${yolSpeed}</td>
                <td class="mil-special">${specialParts.join(', ') || '-'}</td>
                <td class="mil-duel">${totalDuel > 0 ? '+' : ''}${totalDuel}</td>
                <td class="mil-siege">${totalSiege > 0 ? '+' : ''}${totalSiege}</td>
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
                            <div class="hex-settlement-name">
                                <img src="${SETTLEMENT_ICONS[h.settlement.type]}" style="width:20px;height:20px;vertical-align:middle;margin-right:5px;">
                                ${h.settlement.type === 'koy' ? 'Köy' : h.settlement.type === 'sehir' ? 'Şehir' : 'Metropol'}
                            </div>
                            <div style="width:16px; height:16px; border-radius:3px; background:${owner.color}; border:1px solid rgba(255,255,255,0.3);"></div>
                        </div>
                        <div style="font-size:0.65rem; color:#aaa; margin-top:2px;">${owner.name}</div>
                        
                        <div class="hex-section-title" style="font-size:0.55rem; margin-top:8px;">YAPILAR</div>
                        <div class="hex-buildings-list">
                            ${[...h.settlement.buildings].map(btype => `
                                <div class="hex-bld-item">
                                    <span><img src="${BUILDING_ICONS[btype]}" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> ${BUILDING_NAMES[btype]}</span>
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
        
        const currentPid = this.state.currentPlayer.id;
        const filteredUnits = node.army.units.filter(u => {
            const ownerId = u.playerId !== undefined ? u.playerId : node.army.playerId;
            return isEnemy ? (ownerId !== currentPid) : (ownerId === currentPid);
        });

        filteredUnits.forEach(u => {
            const data = UNIT_DATA[u.type];
            const item = document.createElement('div');
            // canSelect mantığı: Kendi birimimizse MP veya saldırı hakkı olmalı, düşmansa her zaman seçilebilir (hedef olarak)
            const canSelect = isEnemy || u.movesLeft > 0 || (data.range > 0 && !u.hasAttacked) || (data.range === 0 && !u.hasAttacked);
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
                    this.showNotice("Bu birim bu tur yapabileceği her şeyi yaptı!", "warning");
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

    showChoiceModal(type, level, onSelectOverride = null, onCancel = null) {
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
            if (onSelectOverride) {
                onSelectOverride(choice);
            } else {
                this.actions.chooseBonus(this.state.currentPlayer.id, type, level, choice);
                this.state.currentPlayer.pendingChoices.shift();
            }
            this.choiceModalOpen = false;
            this.update();
        }, () => {
            if (onCancel) onCancel();
            this.choiceModalOpen = false;
            this.update();
        });
    }

    showChoiceModalWithDesc(title, items, onSelect, onCancel = null) {
        this.els.choiceTitle.textContent = title;
        this.els.choiceGrid.innerHTML = '';

        // Kapat butonu kontrolü (Daha güvenli hale getirildi)
        const closeBtn = this.els.choiceModalCloseBtn || document.getElementById('btnChoiceModalClose');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                this.els.choiceModal.classList.remove('active');
                if (onCancel) onCancel();
                this.choiceModalOpen = false;
            };
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = `choice-item ${item.enabled ? 'enabled' : 'disabled'}`;
            
            const iconHtml = (item.icon && item.icon.endsWith('.png')) 
                ? `<img src="${item.icon}" style="width:64px;height:64px;object-fit:contain;border-radius:50%;">`
                : (item.icon || '❓');

            div.innerHTML = `
                <div class="icon">${iconHtml}</div>
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

    showCombatVS(combat) {
        if (!this.els.combatModal) return;

        const { attacker, defender, result, casualty } = combat;
        const atkPower = attacker.str;
        const defPower = defender.str;
        
        // Atk info
        const atkData = UNIT_DATA[attacker.unit.type];
        this.els.combatAtkFrame.innerHTML = atkData.img ? `<img src="${atkData.img}" style="width:70%; height:70%; object-fit:contain;">` : `<span style="font-size:3rem;">${atkData.emoji || '👤'}</span>`;
        this.els.combatAtkPower.innerText = atkPower;
        document.getElementById('atk-name').innerText = `${attacker.player.name} (${atkData.name})`;
        document.getElementById('atk-name').style.color = attacker.player.color || attacker.player.hex;
        
        // Def info
        const defData = UNIT_DATA[defender.unit.type];
        this.els.combatDefFrame.innerHTML = defData.img ? `<img src="${defData.img}" style="width:70%; height:70%; object-fit:contain;">` : `<span style="font-size:3rem;">${defData.emoji || '👤'}</span>`;
        this.els.combatDefPower.innerText = defPower;
        document.getElementById('def-name').innerText = `${defender.player.name} (${defData.name})`;
        document.getElementById('def-name').style.color = defender.player.color || defender.player.hex;

        // Result text (Initially empty, will fill after animation)
        this.els.combatResultText.innerText = "";
        this.els.combatModal.classList.add('active');

        // Animasyon Tetikle
        this.executeCombatAnimation(combat);
    }

    executeCombatAnimation(combat) {
        const field = document.getElementById('battlefield');
        const svg = document.getElementById('animSvg');
        const attackerEl = this.els.combatAtkFrame;
        const defenderEl = this.els.combatDefFrame;
        
        if (!field || !svg) return;

        const fw = field.offsetWidth;
        const midY = field.offsetHeight / 2;
        const startX = 100;
        const endX = fw - 100;

        const unitType = combat.attacker.unit.type;
        
        // Animasyon Yardımcıları (Kapsama dahil edildi)
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const mkEl = (tag, attrs) => {
            const e = document.createElementNS(SVG_NS, tag);
            for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
            return e;
        };

        const triggerAnim = (el, animName, durationMs) => {
            return new Promise(res => {
                el.style.animation = 'none';
                void el.offsetWidth;
                el.style.animation = `${animName} ${durationMs}ms ease forwards`;
                setTimeout(() => { res(); }, durationMs);
            });
        };

        const meleeFlash = (emoji = '⚡', dur = 320) => {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute; top:50%; right:120px; font-size:40px; z-index:10; pointer-events:none; animation:meleeFlash ${dur}ms ease forwards;`;
            el.textContent = emoji;
            field.appendChild(el);
            setTimeout(() => el.remove(), dur + 100);
        };

        const smokeEffect = (x, y) => {
            ['rgba(180,180,180,0.7)', 'rgba(140,140,140,0.5)'].forEach((color, i) => {
                const size = 20 + i * 15;
                const s = document.createElement('div');
                s.style.cssText = `position:absolute; border-radius:50%; pointer-events:none; z-index:4; width:${size}px; height:${size}px; background:${color}; left:${x - size/2}px; top:${y - size/2}px; transition:opacity 0.5s, transform 0.5s;`;
                field.appendChild(s);
                void s.offsetWidth;
                s.style.opacity = '0';
                s.style.transform = 'scale(2) translateY(-20px)';
                setTimeout(() => s.remove(), 700);
            });
        };

        const flyProjectile = (sx, sy, ex, ey, opts, onEnd) => {
            svg.setAttribute('viewBox', `0 0 ${fw} ${field.offsetHeight}`);
            const projectile = mkEl(opts.shape === 'circle' ? 'circle' : 'line', {
                fill: opts.fill || '#555', stroke: opts.stroke || '#c8a84b', 'stroke-width': 3
            });
            if (opts.shape === 'circle') { projectile.setAttribute('r', opts.r || 8); }
            svg.appendChild(projectile);

            const DURATION = opts.dur || 400;
            const t0 = performance.now();
            const frame = (now) => {
                const t = Math.min((now - t0) / DURATION, 1);
                const cx = sx + (ex - sx) * t;
                const arc = (opts.arc || 0) * Math.sin(Math.PI * t);
                const cy = sy + (ey - sy) * t + arc;
                if (opts.shape === 'circle') {
                    projectile.setAttribute('cx', cx); projectile.setAttribute('cy', cy);
                } else {
                    projectile.setAttribute('x1', cx - 20); projectile.setAttribute('y1', cy);
                    projectile.setAttribute('x2', cx); projectile.setAttribute('y2', cy);
                }
                if (t < 1) requestAnimationFrame(frame);
                else { projectile.remove(); onEnd(); }
            };
            requestAnimationFrame(frame);
        };

        const onHit = () => {
            defenderEl.style.animation = 'none'; void defenderEl.offsetWidth;
            defenderEl.style.animation = 'enemyShake 0.5s ease';
            
            // Sonuç metnini göster
            const { attacker, defender, casualty } = combat;
            const atkData = UNIT_DATA[attacker.unit.type];
            const defData = UNIT_DATA[defender.unit.type];
            let resText = "";
            if (casualty === 'attacker') {
                resText = `❌ ${atkData.name} mağlup oldu!`;
                this.els.combatResultText.style.color = "#ff4444";
            } else if (casualty === 'defender') {
                resText = `⚔️ ${defData.name} yok edildi!`;
                this.els.combatResultText.style.color = "#44ff44";
            } else {
                resText = "🛡️ İki taraf da sağ kaldı.";
                this.els.combatResultText.style.color = "#aaa";
            }
            this.els.combatResultText.innerText = resText;
        };

        // Birim bazlı animasyon tetikleme
        if (unitType === 'okcu' || unitType === 'atli_okcu') {
            triggerAnim(attackerEl, 'archerShoot', 300);
            setTimeout(() => flyProjectile(startX + 30, midY, endX - 30, midY, { arc: -40, dur: 450 }, onHit), 150);
        } else if (unitType === 'mizrakci') {
            triggerAnim(attackerEl, 'spearThrust', 400).then(onHit);
            meleeFlash('⚡');
        } else if (unitType === 'topcu' || unitType === 'mancinik') {
            triggerAnim(attackerEl, 'cannonRecoil', 400);
            smokeEffect(startX + 40, midY);
            setTimeout(() => flyProjectile(startX + 40, midY, endX - 20, midY, { shape: 'circle', arc: -60, dur: 600 }, () => {
                smokeEffect(endX - 20, midY);
                onHit();
            }), 200);
        } else if (unitType === 'sovalye') {
            triggerAnim(attackerEl, 'knightCharge', 500).then(onHit);
            meleeFlash('💥');
        } else if (unitType === 'hafif_suvari') {
            triggerAnim(attackerEl, 'cavalryGallop', 500).then(onHit);
            meleeFlash('⚔️');
        } else if (unitType === 'kocbasi') {
            triggerAnim(attackerEl, 'ramCharge', 600).then(onHit);
            meleeFlash('💥');
        } else {
            // Varsayılan kılıçlı animasyonu
            triggerAnim(attackerEl, 'swordSlash', 450).then(onHit);
            meleeFlash('⚔️');
        }
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

        const ok = this.actions.tradeWithBank(p.id, sellType, buyType, (sellType === 'gold' ? buyType2 : null), amount);

        if (ok) {
            this.els.tradeModal.classList.remove('active');
            this.showNotice(`${amount} adet takas başarılı!`, "success");
            this.update();
        } else {
            this.showNotice("Takas gerçekleştirilemedi! (Yetersiz kaynak)", "danger");
        }
    }

    showCombatAnimation(attackerNode, defenderNode, res) {
        console.log("Combat Anim:", { type: res.type, res });

        if (res.type === 'range' || res.type === 'overwatch') {
            const startPos = this.renderer.getScreenPos(attackerNode.x, attackerNode.y);
            const endPos = this.renderer.getScreenPos(defenderNode.x, defenderNode.y);
            
            this.shootArrow(startPos, endPos, () => {
                this.createImpactRing(endPos.x, endPos.y);
                this.els.canvas.classList.add('hit');
                setTimeout(() => this.els.canvas.classList.remove('hit'), 500);
            });
        }

        // Renderer bazlı animasyonu tetikle
        const animType = (res.type === 'range' || res.type === 'overwatch') ? 'range' : 'melee';
        const aRolls = res.attacker.rolls;
        const dRolls = res.defender.rolls;
        
        // Bonusları hesapla
        const aTotal = res.attacker.str;
        const dTotal = res.defender.str;
        const aBonus = aTotal - (aRolls[0] + aRolls[1]);
        const dBonus = dTotal - (dRolls[0] + dRolls[1]);
        
        const unitType = res.attacker.unit ? res.attacker.unit.type : 'kilicli';
        
        this.renderer.triggerCombatAnimation(attackerNode, defenderNode, animType, aRolls, dRolls, aBonus, dBonus, aTotal, dTotal, unitType);

        // Eski emoji animasyonunu da (efekt olarak) hedefin üstünde gösterelim
        const el = document.createElement('div');
        el.className = 'combat-anim';
        el.textContent = res.type === 'range' ? '🏹' : '⚔️';
        const rect = this.renderer.canvas.getBoundingClientRect();
        const sx = defenderNode.x * this.renderer.scale + this.renderer.offsetX + rect.left;
        const sy = defenderNode.y * this.renderer.scale + this.renderer.offsetY + rect.top;
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

    // ── SVG ARROW ANIMATION ────────────────────────────────────────
    
    makeSvgEl(tag, attrs) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
    }

    clearArrow() {
        const svg = document.getElementById('arrowSvg');
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        trailTimeouts.forEach(clearTimeout);
        trailTimeouts = [];
        if (arrowAnimId) { cancelAnimationFrame(arrowAnimId); arrowAnimId = null; }
    }

    shootArrow(startPos, endPos, onComplete) {
        this.clearArrow();

        const svg = document.getElementById('arrowSvg');
        const wrapper = document.getElementById('canvasWrapper');
        if (!svg || !wrapper) return;

        svg.setAttribute('viewBox', `0 0 ${wrapper.offsetWidth} ${wrapper.offsetHeight}`);

        const defs = this.makeSvgEl('defs', {});
        const marker = this.makeSvgEl('marker', {
            id: 'arrowhead',
            viewBox: '0 0 10 10',
            refX: '8', refY: '5',
            markerWidth: '5', markerHeight: '5',
            orient: 'auto-start-reverse'
        });
        const mpath = this.makeSvgEl('path', {
            d: 'M1 1L9 5L1 9',
            fill: 'none',
            stroke: '#e8c96a',
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
        });
        marker.appendChild(mpath);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const trailGroup = this.makeSvgEl('g', {});
        const glow       = this.makeSvgEl('line', {
            stroke: 'rgba(255,240,150,0.35)',
            'stroke-width': '7',
            'stroke-linecap': 'round'
        });
        const shaft      = this.makeSvgEl('line', {
            stroke: '#c8a84b',
            'stroke-width': '3.5',
            'stroke-linecap': 'round',
            'marker-end': 'url(#arrowhead)'
        });
        const feather    = this.makeSvgEl('polygon', {
            fill: '#8b5e3c',
            stroke: '#6b3f1c',
            'stroke-width': '0.5'
        });

        svg.appendChild(trailGroup);
        svg.appendChild(glow);
        svg.appendChild(shaft);
        svg.appendChild(feather);

        const DURATION = 420; 
        const ARC_HEIGHT = -18;
        const TAIL_LENGTH = 36;
        const TRAIL_INTERVAL = 28;

        const startTime = performance.now();
        let lastTrail = 0;

        const easeOut = (t) => 1 - Math.pow(1 - t, 2.5);

        const frame = (now) => {
            const elapsed = now - startTime;
            const t  = Math.min(elapsed / DURATION, 1);
            const et = easeOut(t);

            const cx = startPos.x + (endPos.x - startPos.x) * et;
            const cy = startPos.y + (endPos.y - startPos.y) * et + ARC_HEIGHT * Math.sin(Math.PI * et);

            const nextT = Math.min(t + 0.01, 1);
            const nextEt = easeOut(nextT);
            const nx = startPos.x + (endPos.x - startPos.x) * nextEt;
            const ny = startPos.y + (endPos.y - startPos.y) * nextEt + ARC_HEIGHT * Math.sin(Math.PI * nextEt);
            const rad = Math.atan2(ny - cy, nx - cx);

            const tx = cx - Math.cos(rad) * TAIL_LENGTH;
            const ty = cy - Math.sin(rad) * TAIL_LENGTH;

            shaft.setAttribute('x1', tx);  shaft.setAttribute('y1', ty);
            shaft.setAttribute('x2', cx);  shaft.setAttribute('y2', cy);

            glow.setAttribute('x1', tx + Math.cos(rad) * 4);
            glow.setAttribute('y1', ty + Math.sin(rad) * 4);
            glow.setAttribute('x2', cx);   glow.setAttribute('y2', cy);

            const fw = 8, fh = 5;
            const px = tx - Math.cos(rad) * fw;
            const py = ty - Math.sin(rad) * fw;
            const perp = rad + Math.PI / 2;
            const p1x = px + Math.cos(perp) * fh, p1y = py + Math.sin(perp) * fh;
            const p2x = px - Math.cos(perp) * fh, p2y = py - Math.sin(perp) * fh;
            feather.setAttribute('points', `${tx},${ty} ${p1x},${p1y} ${px},${py} ${p2x},${p2y}`);

            if (elapsed - lastTrail > TRAIL_INTERVAL && t < 0.95) {
                lastTrail = elapsed;
                const dot = this.makeSvgEl('circle', {
                    cx: cx, cy: cy, r: '2',
                    fill: 'rgba(255,230,100,0.6)'
                });
                trailGroup.appendChild(dot);
                const tid = setTimeout(() => {
                    if (!dot.parentNode) return;
                    dot.style.transition = 'opacity 0.2s';
                    dot.style.opacity = '0';
                    setTimeout(() => dot.parentNode?.removeChild(dot), 200);
                }, 100);
                trailTimeouts.push(tid);
            }

            if (t < 1) {
                arrowAnimId = requestAnimationFrame(frame);
            } else {
                this.clearArrow();
                if (onComplete) onComplete();
            }
        };

        arrowAnimId = requestAnimationFrame(frame);
    }

    createImpactRing(x, y) {
        const ring = document.createElement('div');
        ring.className = 'impact-ring';
        ring.style.left = `${x}px`;
        ring.style.top = `${y}px`;
        const wrapper = document.getElementById('canvasWrapper');
        if (wrapper) {
            wrapper.appendChild(ring);
            setTimeout(() => ring.remove(), 600);
        }
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
        });

        // Menzil vurgusu için actualRange içindeki tüm nodeları bulalım
        let actualRange = udata.range || 0;
        if (unit.type === 'topcu' && this.state.currentPlayer.bonusState && this.state.currentPlayer.bonusState.topcuRangeBonus) {
            actualRange += this.state.currentPlayer.bonusState.topcuRangeBonus;
        }

        if (actualRange > 0) {
            this.state.grid.nodes.forEach(n => {
                const dist = this.state.grid.getDistance(nodeId, n.id);
                if (dist > 0 && dist <= actualRange && n.army && String(n.army.playerId) !== String(this.state.currentPlayer.id)) {
                    this.state.rangeHighlightedNodes.add(n.id);
                }
            });
        }
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
