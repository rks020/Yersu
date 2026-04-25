'use strict';
// ============================================================
// State — Oyunun merkezi veri havuzu (Single Source of Truth)
// ============================================================

class Player {
    constructor(id, name, color, isAI = false) {
        this.id      = id;
        this.name    = name;
        this.color   = color.code;
        this.colorId = color.id;
        this.isAI    = isAI;
        
        // Kaynaklar
        this.resources = {
            besin: 0,
            odun:  0,
            tas:   0,
            kil:   0,
            maden: 0
        };
        this.gold = 0;
        
        // Mülkiyet
        this.settlements = []; // hexId listesi
        this.roads       = []; // edgeId listesi
        this.units       = []; // units [ { uid, type, hexId, hp, moved } ]

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

        this.rerollUsedThisTurn = false;
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
        this.subPhase          = 'move';  

        this.lastRoll          = null; 
        this.sieges            = {};
        this.firstLv3          = {}; 
        this.winner            = null;
        this.gameOver          = false;
        this.log               = [];

        this.selected          = null; 
        this.highlightedHexes  = new Set();
        this.highlightedNodes  = new Set();
        this.highlightedEdges  = new Set();
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
            if (t === 'koy')      base += 2;
            if (t === 'sehir')    base += 4;
            if (t === 'metropol') base += 6;
        });
        player._basePopFromSettlements = base;
        player.maxPopulation = Math.min(MAX_POPULATION, player._basePopFromSettlements + player.bonusState.ciftlikPopBonus);
    }

    recalcBuildings(player) {
        const counts = { ciftlik: 0, kisla: 0, kervansaray: 0, tapinak: 0, muhendishane: 0, tiyatro: 0 };
        player.settlements.forEach(hid => {
            const hex = this.grid.hexes.get(hid);
            if (!hex || !hex.settlement) return;
            hex.settlement.buildings.forEach(b => {
                if (counts[b] !== undefined) counts[b]++;
            });
        });
        player.buildings = counts;
    }

    calculateVP(player) {
        let vp = 0;

        player.settlements.forEach(hid => {
            const hex = this.grid.hexes.get(hid);
            if (!hex || !hex.settlement) return;
            const t = hex.settlement.type;
            vp += VP[t] || 0;
        });

        if (player.achievements.gameEnder) vp += VP.bitirenOyuncu;
        if (player.achievements.ciftlikLv3First) vp += 3;

        if (player.achievements.kislaLv3First) {
            const armies = player.units.length;
            const settls = player.settlements.length || 1;
            vp += Math.ceil(armies / settls);
        }

        if (player.achievements.tapinakLv3First) {
            player.settlements.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (!hex || !hex.settlement) return;
                if (!hex.settlement.buildings.has('tapinak')) return;
                if (hex.settlement.type === 'sehir')    vp += 1;
                if (hex.settlement.type === 'metropol') vp += 2;
            });
        }

        if (player.achievements.kervansarayLv3First) {
            const longestRoad = this.grid.getLongestRoad(player.id);
            vp += Math.ceil(longestRoad / 2);
        }

        if (player.achievements.tiyatroLv3First) {
            player.settlements.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (!hex || !hex.settlement) return;
                if (hex.settlement.type === 'metropol') vp += 2;
            });
        }

        return vp;
    }

    rollProductionDice() {
        const d1 = Math.ceil(Math.random() * 6);
        const d2 = Math.ceil(Math.random() * 6);
        this.lastRoll = { d1, d2, total: d1 + d2 };
        return this.lastRoll;
    }

    distributeResources(roll) {
        const total = roll.total;
        const gained = []; 

        this.grid.hexes.forEach(hex => {
            if (hex.number !== total) return;
            if (hex.resources.length === 0) return;

            const targets = [hex.id, ...hex.adjacentHexes];
            
            targets.forEach(hid => {
                const targetHex = this.grid.hexes.get(hid);
                if (!targetHex || !targetHex.settlement) return;
                
                const owner = this.players.find(p => p.id === targetHex.settlement.playerId);
                if (owner) {
                    hex.resources.forEach(res => {
                        const settl = targetHex.settlement;
                        let amount = (settl.type === 'koy') ? 1 : ((settl.type === 'sehir' || settl.type === 'metropol') ? 2 : 1);
                        if (res === 'besin' && settl.buildings.has('ciftlik')) amount += 1;
                        owner.gain(res, amount);
                        gained.push({ playerId: owner.id, res, amount });
                    });
                }
            });
        });

        this.players.forEach(p => {
            if (p.bonusState.ciftlikResPerTurn > 0) {
                p.gain('besin', p.bonusState.ciftlikResPerTurn);
                gained.push({ playerId: p.id, res: 'besin', amount: p.bonusState.ciftlikResPerTurn });
            }
            p.gain('besin', 1);
            p.gain('odun', 1);
            p.gain('tas', 1);
            gained.push({ playerId: p.id, res: 'besin', amount: 1 });
            gained.push({ playerId: p.id, res: 'odun', amount: 1 });
            gained.push({ playerId: p.id, res: 'tas', amount: 1 });
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
            nextPlayer.units.forEach(u => u.moved = false);
        }
    }

    nextTurn() {
        const p = this.currentPlayer;
        p.deadUnitsLastTurn = [...(p._deadThisTurn || [])];
        p._deadThisTurn     = [];
        p.rerollUsedThisTurn = false;

        Object.entries(this.sieges).forEach(([hexId, s]) => {
            if (s.attackerId === p.id) {
                s.turnsActive++;
                const attackerHex = this.grid.hexes.get(s.attackerHexId);
                if (attackerHex && attackerHex.army && attackerHex.army.playerId === p.id) {
                    let siegePower = 1;
                    attackerHex.army.units.forEach(u => {
                        const udata = UNIT_DATA[u.type];
                        if (udata.siege) siegePower += udata.siege;
                    });
                    
                    if (p.settlements.some(hid => {
                        const h = this.grid.hexes.get(hid);
                        return h.settlement && h.settlement.buildings.has('muhendishane');
                    })) {
                        siegePower += 1;
                    }

                    s.points += siegePower;
                    this.addLog(`🏰 Kuşatma ilerliyor (${hexId}): +${siegePower} puan (Toplam: ${s.points}).`, 'info');
                    
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

        this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.players.length;
        if (this.currentPlayerIdx === 0) {
            this.turn++;
            if (this.turn > MAX_TURNS) {
                this.endGameByTurns();
                return;
            }
            if (this.phase === 'setup') {
                this.phase = 'main';
                this.addLog("Ana oyun aşamasına geçildi!", "success");
            }
        }

        this.applyUpkeep(p);
        this.resetTurnActions();
        this.subPhase = 'production';
        this.clearSelection();
    }

    clearSelection() {
        this.selected         = null;
        this.highlightedHexes = new Set();
        this.highlightedNodes = new Set();
        this.highlightedEdges = new Set();
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
            const vp = this.calculateVP(p);
            if (vp >= VP_GOAL) {
                this.gameOver = true;
                this.winner = p;
                this.addLog(`🏆 ZAFER! ${p.name} ${VP_GOAL} Puana ulaşarak oyunu kazandı!`, 'success');
            }
        }
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

    calculateDuelStrength(unit, player, hex) {
        const data = UNIT_DATA[unit.type];
        let strength = 0;
        strength += Math.ceil(Math.random() * 6);
        strength += (data.duel || 0);

        if (hex && hex.settlement && hex.settlement.playerId === player.id) {
            const b = hex.settlement.buildings;
            if (b.has('kisla')) {
                if (['mizrakci', 'kilicli', 'okcu'].includes(unit.type)) strength += 1;
            }
            if (this.sieges[hex.id] && b.has('tapinak')) {
                strength += 1;
            }
        }
        return strength;
    }

    resolveCombat(attackerUnit, attackerPlayer, targetHex) {
        const defenderPlayerId = targetHex.army.playerId;
        const defenderPlayer   = this.players.find(p => p.id === defenderPlayerId);
        const defenderUnit     = targetHex.army.units[0];
        
        if (!defenderUnit) return { winner: 'attacker', casualty: 'none' };

        let aStr = this.calculateDuelStrength(attackerUnit, attackerPlayer, this.grid.hexes.get(attackerUnit.hexId));
        let dStr = this.calculateDuelStrength(defenderUnit, defenderPlayer, targetHex);

        const aData = UNIT_DATA[attackerUnit.type];
        const dData = UNIT_DATA[defenderUnit.type];

        if (aData.special === 'anti_cavalry' && dData.cls === 'suvari') aStr += 2;
        if (aData.special === 'anti_infantry' && dData.cls === 'piyade') aStr += 2;

        this.addLog(`⚔️ ${attackerUnit.type} (${aStr}) vs ${defenderUnit.type} (${dStr})`, 'info');

        let winner = 'none';
        let casualty = 'both';
        
        if (aStr > dStr) {
            winner = 'attacker';
            casualty = 'defender';
            this.addLog(`🗡️ ${attackerPlayer.name} düşmanı yok etti ve mevziyi boşalttı!`, 'success');
        } else if (dStr > aStr) {
            winner = 'defender';
            casualty = 'attacker';
            this.addLog(`💀 ${attackerPlayer.name} saldırıda birimini kaybetti.`, 'danger');
        } else {
            this.addLog(`⚔️ Zorlu çarpışmada iki taraf da ağır kayıp verdi!`, 'warning');
        }

        return { 
            type: 'melee',
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
                const hex = this.grid.hexes.get(lost.hexId);
                if (hex && hex.army) {
                    hex.army.units = hex.army.units.filter(u => u.uid !== lost.uid);
                    if (hex.army.units.length === 0) hex.army = null;
                }
            }
        }
    }

    hexAdjacentToBataklik(hexId) {
        return this.grid.getAdjacentHexIds(hexId).some(aid => {
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
            this.discoveredHexes.add(u.hexId);
            const h = this.grid.hexes.get(u.hexId);
            if (h) h.adjacentHexes.forEach(ahid => this.discoveredHexes.add(ahid));
        });
    }
}
