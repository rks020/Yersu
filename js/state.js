'use strict';
// ============================================================
// State — Oyunun merkezi veri havuzu (Single Source of Truth)
// ============================================================

class Player {
    constructor(id, name, color, isAI = false) {
        this.id      = id;
        this.name    = name;
        this.color   = color.hex;
        this.colorId = color.id;
        this.isAI    = isAI;
        
        // Kaynaklar
        this.resources = {
            besin: 0,
            odun:  0,
            tas:   0,
            kil:   0,
            maden: 0,
            gold:  0
        };
        
        // Mülkiyet
        this.settlements = []; // hexId listesi
        this.roads       = []; // edgeId listesi
        this.units       = []; // units listesi
        this.buildingCounts = {}; 
        this.chosenBonuses = {};  // { type: { level: 'A'|'B' } }
        this.pendingChoices = []; // [ { type, level } ]
        this.isFinisher = false;

        // Bonuslar (Binalardan gelen pasif etkiler)
        this.bonusState = {
            ciftlikPopBonus: 0,
            ciftlikResPerTurn: 0,
            ciftlikCostReduction: 0,
            ciftlikSiegeBonus: false,
            roadCostReduction: 0,
            bankRate: 6,
            spawnUnitXp: 0,
            sovGoldReduction: 0,
            canBuildSiege: false,
            tiyatroLv3SiegeReduction: false,
            theatreCostReduction: 0,
            muhendishaneSiegeBonus: false,
        };

        // İstatistikler / Başarımlar
        this.buildings = {}; // buildingType -> count
        this.maxPopulation = 2; // Başlangıç limiti
        
        this.achievements = {
            ciftlikLv3First:     false,
            kislaLv3First:       false,
            kervansarayLv3First: false,
            tapinakLv3First:     false,
            tiyatroLv3First:     false,
            gameEnder:           false,
        };
        this.setupDone = false; 
        this.actionsDoneThisTurn = new Set();
    }

    getTotalResources() {
        return Object.values(this.resources).reduce((a, b) => a + b, 0);
    }

    canAfford(cost) {
        for (const [res, amt] of Object.entries(cost)) {
            if ((this.resources[res] || 0) < amt) return false;
        }
        return true;
    }

    spend(cost) {
        for (const [res, amt] of Object.entries(cost)) {
            this.resources[res] = (this.resources[res] || 0) - amt;
        }
    }

    gain(res, amount) {
        this.resources[res] = (this.resources[res] || 0) + amount;
    }

    updateMaxPopulation() {
        let pop = 0;
        pop += this.bonusState.ciftlikPopBonus;
        const base = this._basePopFromSettlements || 0;
        this.maxPopulation = Math.min(MAX_POPULATION, base + pop);
    }

    getPopulationUsed() {
        return this.units.length;
    }

    hasUnit(uid) { return this.units.some(u => u.uid === uid); }

    nextUnitId() {
        return `u_${this.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    }
}

// ============================================================

class GameState {
    constructor(playerConfigs, mapSizeKey) {
        const sizeInfo = MAP_SIZES[mapSizeKey];
        this.mapSizeKey = mapSizeKey;

        this.grid = new HexGrid(sizeInfo.radius, sizeInfo.hexSize);
        MapGen.generate(this.grid);

        this.players = playerConfigs.map((cfg, i) =>
            new Player(i, cfg.name, PLAYER_COLORS.find(c => c.id === cfg.colorId) || PLAYER_COLORS[i], cfg.isAI)
        );

        this.turn              = 1;
        this.currentPlayerIdx  = 0;
        this.phase             = 'setup';
        this.subPhase          = 'production';  

        this.lastRoll          = null; 
        this.sieges            = {};
        this.firstToLv3        = {}; 
        this.winner            = null;
        this.gameOver          = false;
        this.log               = [];

        this.selected          = null; 
        this.highlightedHexes  = new Set();
        this.highlightedNodes  = new Set();
        this.highlightedEdges  = new Set();
        this.rangeHighlightedNodes = new Set();
        this.actionMode        = null; 

        this.selectedBuilding  = null;
        this.selectedUnit      = null; 
        this.selectedUnitNode  = null; 

        this.resetTurnActions();
        this.discoveredHexes = new Set();
        this.initDiscovery();
    }

    get currentPlayer() { return this.players[this.currentPlayerIdx]; }

    getSettlementType(hexId) {
        const h = this.grid.hexes.get(hexId);
        return h && h.settlement ? h.settlement.type : null;
    }

    upgradeSettlement(hexId) {
        const h = this.grid.hexes.get(hexId);
        if (!h || !h.settlement) return;
        const buildingCount = h.settlement.buildings.size;
        
        if (buildingCount >= 3 && buildingCount < 6) h.settlement.type = 'sehir';
        else if (buildingCount >= 6)                 h.settlement.type = 'metropol';
        else                                         h.settlement.type = 'koy';
    }

    recalcPopulation(player) {
        let base = 0;
        player.settlements.forEach(hid => {
            const hex = this.grid.hexes.get(hid);
            if (!hex || !hex.settlement) return;
            const t = hex.settlement.type;
            if (t === 'koy')      base += 1;
            if (t === 'sehir')    base += 2;
            if (t === 'metropol') base += 3;
        });
        player._basePopFromSettlements = base;
        
        // Çiftlik Seviye 3A bonusu (+2 Pop)
        let bonusPop = 0;
        if (player.buildingCounts.ciftlik >= 4) bonusPop = 2; // Basitleştirme: Eğer 3. seviye ise +2
        
        player.maxPopulation = Math.min(16, player._basePopFromSettlements + bonusPop);
    }

    recalcBuildings(player) {
        const oldCounts = {...(player.buildingCounts || {})};
        const counts = { ciftlik: 0, kisla: 0, kervansaray: 0, tapinak: 0, muhendishane: 0, tiyatro: 0 };
        
        player.settlements.forEach(hid => {
            const hex = this.grid.hexes.get(hid);
            if (!hex || !hex.settlement) return;
            hex.settlement.buildings.forEach(b => {
                if (counts[b] !== undefined) counts[b]++;
            });
        });

        const getLv = (c) => (c >= 4 ? 3 : (c >= 2 ? 2 : (c >= 1 ? 1 : 0)));

        ALL_BUILDINGS.forEach(b => {
            const oldLv = getLv(oldCounts[b] || 0);
            const newLv = getLv(counts[b]);
            
            if (newLv > oldLv && newLv > 1) {
                // Sadece 2 ve 3. seviye için seçim gerekir
                player.pendingChoices.push({ type: b, level: newLv });
            }

            if (!this.firstToLv3[b] && counts[b] >= 4) {
                this.firstToLv3[b] = player.id;
                this.addLog(`🏆 ${player.name} ${BUILDING_NAMES[b]} yapısını 3. seviyeye ulaştıran İLK oyuncu oldu!`, 'success');
            }
        });

        player.buildingCounts = counts; 
        player.buildings = counts;
    }

    calculateVP(player) {
        let vp = 0;

        player.settlements.forEach(hid => {
            const hex = this.grid.hexes.get(hid);
            if (!hex || !hex.settlement) return;
            vp += VP[hex.settlement.type] || 0;
        });

        if (player.isFinisher) vp += VP.finisher;

        // "İlk Başaran" Bonusu Puanları
        if (this.firstToLv3.ciftlik === player.id) vp += 3;
        
        if (this.firstToLv3.kisla === player.id) {
            const score = Math.ceil(player.units.length / Math.max(1, player.settlements.length));
            vp += score;
        }

        if (this.firstToLv3.tapinak === player.id) {
            player.settlements.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (hex.settlement && hex.settlement.buildings.has('tapinak')) {
                    if (hex.settlement.type === 'sehir')    vp += 1;
                    if (hex.settlement.type === 'metropol') vp += 2;
                }
            });
        }

        if (this.firstToLv3.kervansaray === player.id) {
            let maxRoad = 0;
            this.grid.edges.forEach(e => { if (e.road === player.id) maxRoad++; });
            vp += Math.ceil(maxRoad / 2);
        }

        if (this.firstToLv3.tiyatro === player.id) {
            player.settlements.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (hex.settlement && hex.settlement.type === 'metropol') vp += 2;
            });
        }

        return vp;
    }

    rollProductionDice() {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        this.lastRoll = { d1, d2, total: d1 + d2 };

        if (this.phase === 'setup') {
            this.currentPlayer.units.forEach(u => {
                u.movesLeft = this.lastRoll.total;
                const node = this.grid.nodes.get(u.nodeId);
                if (node && node.army) {
                    const nu = node.army.units.find(au => au.uid === u.uid);
                    if (nu) nu.movesLeft = u.movesLeft;
                }
            });
            this.addLog(`🎲 ${this.currentPlayer.name} ${this.lastRoll.total} attı ve hareket puanı kazandı.`, 'info');
            this.subPhase = 'move'; 
        } else {
            this.distributeResources(this.lastRoll);
            this.subPhase = 'build'; // Üretimden sonra İnşa/Ticaret başlar
        }
        return this.lastRoll;
    }

    distributeResources(roll) {
        const total = roll.total;
        const gained = []; 

        this.grid.hexes.forEach(hex => {
            if (hex.number !== total) return;
            if (hex.resources.length === 0) return;

            if (hex.settlement) {
                const owner = this.players.find(p => p.id === hex.settlement.playerId);
                if (owner) {
                    hex.resources.forEach(res => {
                        let amount = 3; 
                        if (res === 'besin' && hex.settlement.buildings.has('ciftlik')) amount += 1;
                        owner.gain(res, amount);
                        gained.push({ playerId: owner.id, res, amount });
                        this.addLog(`🌾 ${owner.name}, ${hex.number} zarından ${amount} ${res} kazandı.`, 'success');
                    });
                }
            }
        });

        this.players.forEach(p => {
            if (p.bonusState.ciftlikResPerTurn > 0) {
                p.gain('besin', p.bonusState.ciftlikResPerTurn);
                gained.push({ playerId: p.id, res: 'besin', amount: p.bonusState.ciftlikResPerTurn });
                this.addLog(`🌾 ${p.name}, Çiftlik bonusundan ${p.bonusState.ciftlikResPerTurn} besin kazandı.`, 'success');
            }
        });

        return gained;
    }

    resetTurnActions() {
        this.actionsDone = {
            movedUnits:    [],
            attacked:      false,
            builtRoad:     false,
            builtVillage:  false,
            builtBuilding: false,
            trainedUnit:   false,
            traded:        false,
            sieged:        false,
        };

        const nextPlayer = this.players[this.currentPlayerIdx];
        if (nextPlayer) {
            nextPlayer.units.forEach(u => {
                const data = UNIT_DATA[u.type];
                u.movesLeft = data.speed || 2;
            });
        }
    }

    nextTurn() {
        const p = this.currentPlayer;

        // Binalardan gelen tur başı etkiler
        if (p.chosenBonuses.ciftlik && p.chosenBonuses.ciftlik[2] === 'A') {
            p.gain('besin', 1);
        }

        p.deadUnitsLastTurn = [...(p._deadThisTurn || [])];
        p._deadThisTurn     = [];
        p.rerollUsedThisTurn = false;

        // Kuşatma ilerlemeleri
        Object.entries(this.sieges).forEach(([hexId, s]) => {
            if (s.attackerId === p.id) {
                s.turnsActive++;
                const node = this.grid.nodes.get(s.attackerNodeId);
                if (node && node.army && node.army.playerId === p.id) {
                    let siegePower = 1;
                    node.army.units.forEach(u => {
                        const udata = UNIT_DATA[u.type];
                        if (udata.siege) siegePower += udata.siege;
                    });
                    
                    if (p.settlements.some(hid => {
                        const h = this.grid.hexes.get(hid);
                        return h.settlement && h.settlement.buildings.has('muhendishane');
                    })) {
                        siegePower += 1;
                    }

                    // Yeni Kuşatma Mekaniği: Zar Atışı
                    const aRoll = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
                    const dRoll = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
                    
                    let aTotal = aRoll + (siegePower - 1); 
                    let dTotal = dRoll;
                    
                    if (aTotal > dTotal) {
                        s.points += 1;
                        this.addLog(`🏰 Kuşatma ilerliyor (${hexId}): Başarılı Zar (${aTotal} vs ${dTotal}). Puan: ${s.points}`, 'info');
                    } else {
                        this.addLog(`🏰 Kuşatma denemesi başarısız (${hexId}): Zar (${aTotal} vs ${dTotal}).`, 'warning');
                    }
                    
                    const req = this.calculateSiegeRequirement(hexId, p.id);
                    if (s.points >= req) {
                        if (window.appMain && window.appMain.actions) {
                            window.appMain.actions.resolveSiege(hexId);
                        }
                    }
                } else {
                    delete this.sieges[hexId];
                    this.addLog(`🏰 ${hexId} kuşatması kırıldı!`, 'info');
                }
            }
        });

        // Tur sonu eylemleri
        this.applyUpkeep(p);
        this.checkVictory();
        if (this.gameOver) return;

        // Sıradaki oyuncu
        this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.players.length;
        if (this.currentPlayerIdx === 0) {
            this.turn++;
            if (this.turn > MAX_TURNS) {
                this.endGameByTurns();
                return;
            }
            if (this.phase === 'setup') {
                // Setup aşaması her oyuncu ilk köyünü kurunca biter. 
                // buildVillage içinde kontrol ediliyor.
            }
        }

        const nextP = this.players[this.currentPlayerIdx];
        this.resetTurnActions();
        
        // Setup aşaması kontrolü: Eğer herkes köyünü ve askerini koyduysa Main'e geç
        if (this.phase === 'setup') {
            const allDone = this.players.every(pl => pl.settlements.length >= 1 && pl.units.length >= 1);
            if (allDone) {
                this.phase = 'Main';
                this.addLog("⚔️ Kurulum tamamlandı! Ana aşama başlıyor.", "success");
            }
        }

        // Setup aşamasında üretim (zar) yok, direkt aksiyona geçiyoruz
        this.subPhase = (this.phase === 'setup') ? 'action' : 'production';
        this.activeCombat = null; // Tur başında savaşı temizle
        this.addLog(`🔔 Sıra ${nextP.name} oyuncusunda.`, 'info');
        this.clearSelection();
        
        this.updateVisibility();
    }

    transitionToMove() {
        if (this.subPhase === 'build') {
            this.subPhase = 'move';
            this.addLog("🏇 İnşa aşaması bitti, hareket aşaması başladı.", "info");
        }
    }

    clearSelection() {
        this.selected         = null;
        this.highlightedHexes = new Set();
        this.highlightedNodes = new Set();
        this.highlightedEdges = new Set();
        this.rangeHighlightedNodes = new Set();
        this.actionMode       = null;
        this.selectedBuilding = null;
        this.selectedUnit     = null;
        this.selectedUnitNode = null;
    }

    addLog(msg, type = 'info') {
        this.log.unshift({ msg, type, turn: this.turn, time: Date.now() });
        if (this.log.length > 100) this.log.pop();
    }

    checkVictory() {
        if (this.gameOver) return;
        for (const p of this.players) {
            // Şehir sayısı kontrolü (Oyun 6. şehir kurulunca biter)
            let cityCount = 0;
            p.settlements.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (hex.settlement && (hex.settlement.type === 'sehir' || hex.settlement.type === 'metropol')) {
                    cityCount++;
                }
            });

            if (cityCount >= 6) {
                this.gameOver = true;
                p.isFinisher = true; // Bitiren oyuncu bonusu için
                this.addLog(`🏁 OYUN BİTTİ! ${p.name} 6. şehrini kurarak oyunu sona erdirdi.`, 'success');
                this.winner = this.getWinningPlayer(); // Puanları hesapla ve kazananı bul
            }
        }
    }

    getWinningPlayer() {
        let best = null;
        let maxVp = -1;
        this.players.forEach(p => {
            const vp = this.calculateVP(p);
            if (vp > maxVp) {
                maxVp = vp;
                best = p;
            }
        });
        return best;
    }

    endGameByTurns() {
        this.gameOver = true;
        let bestPlayer = this.players[0];
        let maxVp = -1;
        this.players.forEach(p => {
            const vp = this.calculateVP(p);
            if (vp > maxVp) {
                maxVp = vp;
                bestPlayer = p;
            }
        });
        this.winner = bestPlayer;
        this.addLog(`⌛ OYUN BİTTİ! ${MAX_TURNS} tur tamamlandı.`, 'warning');
        this.addLog(`🏆 KAZANAN: ${bestPlayer.name} (${maxVp} Puan ile)!`, 'success');
    }

    calculateDuelStrength(unit, player, node) {
        const data = UNIT_DATA[unit.type];
        
        // Bir çift zar (2d6)
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const rollTotal = d1 + d2;
        
        let strength = rollTotal + (data.duel || 0);

        if (node) {
            node.hexes.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (hex && hex.settlement && hex.settlement.playerId === player.id) {
                    const b = hex.settlement.buildings;
                    if (b.has('kisla') && ['mizrakci', 'kilicli', 'okcu'].includes(unit.type)) {
                        strength += 1;
                    }
                    if (this.sieges[hex.id] && b.has('tapinak')) {
                        strength += 1;
                    }
                }
            });
        }
        return { total: strength, rolls: [d1, d2] };
    }

    resolveCombat(attackerUnit, attackerPlayer, targetNode, targetUnitOverride = null) {
        const defenderPlayerId = targetNode.army.playerId;
        const defenderPlayer   = this.players.find(p => p.id === defenderPlayerId);
        
        // Eğer hedef birim seçilmediyse ilki (en üstteki) varsayılan olur
        const defenderUnit = targetUnitOverride || targetNode.army.units[0];
        
        if (!defenderUnit) return { winner: 'attacker', casualty: 'none' };

        const aRes = this.calculateDuelStrength(attackerUnit, attackerPlayer, this.grid.nodes.get(attackerUnit.nodeId));
        const dRes = this.calculateDuelStrength(defenderUnit, defenderPlayer, targetNode);
        
        let aStr = aRes.total;
        let dStr = dRes.total;

        const aData = UNIT_DATA[attackerUnit.type];
        const dData = UNIT_DATA[defenderUnit.type];

        if (aData.duelBonusVs && aData.duelBonusVs === dData.cls) aStr += 1;
        if (dData.duelBonusVs && dData.duelBonusVs === aData.cls) dStr += 1;

        this.addLog(`⚔️ ${attackerUnit.type} [${aRes.rolls}] (${aStr}) vs ${defenderUnit.type} [${dRes.rolls}] (${dStr})`, 'info');

        let winner = 'none';
        let casualty = 'none';
        
        if (aStr > dStr) {
            winner = 'attacker';
            casualty = 'defender';
            this.addLog(`🗡️ ${attackerPlayer.name} düşmanı yok etti!`, 'success');
        } else if (dStr > aStr) {
            winner = 'defender';
            casualty = 'attacker';
            this.addLog(`💀 ${attackerPlayer.name} saldırıda birimini kaybetti.`, 'danger');
        } else {
            this.addLog(`⚔️ Zarlar eşit! İki taraf da sağ kaldı.`, 'warning');
        }

        return { 
            type: 'melee',
            attacker: { player: attackerPlayer, unit: attackerUnit, str: aStr },
            defender: { player: defenderPlayer, unit: defenderUnit, str: dStr },
            winner, 
            casualty 
        };
    }

    resolveRangeAttack(attackerUnit, attackerPlayer, targetNode) {
        const defenderPlayerId = targetNode.army.playerId;
        const defenderPlayer   = this.players.find(p => p.id === defenderPlayerId);
        const defenderUnit     = targetNode.army.units[0];
        
        if (!defenderUnit) return null;

        let aStr = this.calculateDuelStrength(attackerUnit, attackerPlayer, this.grid.nodes.get(attackerUnit.nodeId));
        let dStr = this.calculateDuelStrength(defenderUnit, defenderPlayer, targetNode);

        const aData = UNIT_DATA[attackerUnit.type];
        const dData = UNIT_DATA[defenderUnit.type];

        if (aData.duelBonusVs && aData.duelBonusVs === dData.cls) aStr += 1;
        if (dData.duelBonusVs && dData.duelBonusVs === aData.cls) dStr += 1;

        this.addLog(`🏹 Menzilli: ${attackerUnit.type} (${aStr}) vs ${defenderUnit.type} (${dStr})`, 'info');

        let winner = 'none';
        let casualty = 'none';
        
        // Menzilli saldırıda saldıran zarar görmez (eğer savunanın menzili yoksa)
        if (aStr > dStr) {
            winner = 'attacker';
            casualty = 'defender';
            this.addLog(`🎯 ${attackerPlayer.name} menzilli atışla düşmanı vurdu!`, 'success');
        } else {
            this.addLog(`🏹 Atış ıska geçti veya zırhı geçemedi.`, 'info');
        }

        return { 
            type: 'range',
            attacker: { player: attackerPlayer, unit: attackerUnit, str: aStr },
            defender: { player: defenderPlayer, unit: defenderUnit, str: dStr },
            winner, 
            casualty 
        };
    }

    applyUpkeep(player) {
        const soldierCount = player.units.length;
        if (soldierCount < 2) return;

        const foodCost = Math.floor(soldierCount / 2);
        if (player.resources.besin >= foodCost) {
            player.resources.besin -= foodCost;
            if (foodCost > 0) this.addLog(`🍽️ ${player.name} ordusunu besledi (-${foodCost} Besin).`, 'info');
        } else {
            const lost = player.units.pop();
            this.addLog(`⚠️ ${player.name} ordusunu besleyemedi! 1 birim dağıldı.`, 'danger');
            if (lost) {
                const node = this.grid.nodes.get(lost.nodeId);
                if (node && node.army) {
                    node.army.units = node.army.units.filter(u => u.uid !== lost.uid);
                    if (node.army.units.length === 0) node.army = null;
                }
            }
        }
    }

    hexAdjacentToBataklik(hexId) {
        const hex = this.grid.hexes.get(hexId);
        if (!hex) return false;
        return hex.adjacentHexes.some(aid => {
            const h = this.grid.hexes.get(aid);
            return h && h.biome === 'bataklik';
        });
    }

    getSiegeTargetLevel(hexId) {
        const hex = this.grid.hexes.get(hexId);
        return hex && hex.settlement ? hex.settlement.type : null;
    }

    calculateSiegeRequirement(hexId, attackerId) {
        const hex = this.grid.hexes.get(hexId);
        if (!hex || !hex.settlement) return 3;

        let req = 0;
        const type = hex.settlement.type;
        if (type === 'koy') req = SIEGE_REQ.Koy;
        else if (type === 'sehir') req = SIEGE_REQ.Sehir;
        else if (type === 'metropol') req = SIEGE_REQ.Metropol;

        const owner = this.players.find(p => p.id === hex.settlement.playerId);
        if (owner && hex.settlement.buildings.has('muhendishane')) req++;
        if (owner && hex.settlement.buildings.has('ciftlik')) req++;

        const attacker = this.players.find(p => p.id === attackerId);
        if (attacker && attacker.bonusState.tiyatroLv3SiegeReduction) req = Math.max(1, req - 1);

        return req;
    }

    initDiscovery() {
        this.updateVisibility();
    }

    updateVisibility() {
        const human = this.players.find(p => !p.isAI);
        if (!human) return;

        human.settlements.forEach(hid => {
            this.discoveredHexes.add(hid);
            const h = this.grid.hexes.get(hid);
            if (h) h.adjacentHexes.forEach(ahid => this.discoveredHexes.add(ahid));
        });

        human.units.forEach(u => {
            const node = this.grid.nodes.get(u.nodeId);
            if (node) {
                node.hexes.forEach(hid => {
                    this.discoveredHexes.add(hid);
                    const h = this.grid.hexes.get(hid);
                    if (h) h.adjacentHexes.forEach(ahid => this.discoveredHexes.add(ahid));
                });
            }
        });
    }

    isHexBuildable(hexId) {
        const hex = this.grid.hexes.get(hexId);
        if (!hex || hex.settlement || !BIOME_INFO[hex.biome].canSettle) return false;
        
        for (const nid of hex.nodeIds) {
             const node = this.grid.nodes.get(nid);
             for (const hid of node.hexes) {
                  const h = this.grid.hexes.get(hid);
                  if (h.id !== hexId && h.settlement) return false;
             }
        }
        return true;
    }
}
