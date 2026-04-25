'use strict';
// ============================================================
// Actions — Oyuncu eylemlerini (iş mantığını) yönetir
// ============================================================

class Actions {
    constructor(state) {
        this.state = state;
    }

    // ── Setup Aşaması Eylemleri ────────────────────────────────

    setupPlaceInitialUnit(playerId, nodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        const node = this.state.grid.nodes.get(nodeId);
        if (!node) return false;

        if (node.army) return false;

        const currentUid = p.nextUnitId();
        const unit = { uid: currentUid, type: 'kilicli', hp: 1, movesLeft: 0 };

        p.units.push({ ...unit, nodeId });
        node.army = { playerId, units: [unit] };

        this.state.addLog(`${p.name} başlangıç askerini düğmeye yerleştirdi.`, 'info');
        return true;
    }

    setupSettleVillage(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || hex.settlement) return false;

        if (!this.state.grid.hexIsSettlable(hexId)) return false;
        if (this.state.grid.hexHasAdjacentSettlement(hexId)) return false;

        // Başlangıç kaynakları: Sadece o heksin verdiği kaynaklardan 3'er tane
        hex.resources.forEach(res => p.gain(res, 3));
        p.gold += 3;
        
        hex.settlement = { playerId, type: 'koy', buildings: new Set() };
        p.settlements.push(hexId);
        p.setupDone = true;
        
        this.state.recalcPopulation(p);
        this.state.checkVictory();

        this.state.addLog(`${p.name} ilk köyünü kurdu ve kaynaklarını aldı.`, 'success');
        return true;
    }

    // ── Main Aşama Eylemleri ────────────────────────────────

    buildRoad(playerId, edgeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const edge = this.state.grid.edges.get(edgeId);
        if (!p || !edge || edge.road) return false;

        let cost = BUILD_COSTS.yol;
        
        if (p.bonusState.roadCostReduction > 0) {
            cost = {...cost};
            const mostRes = Object.keys(cost).reduce((a, b) => cost[a] > cost[b] ? a : b);
            cost[mostRes] -= Math.min(cost[mostRes], p.bonusState.roadCostReduction);
        }

        if (!p.canAfford(cost)) return false;

        p.spend(cost);
        edge.road = p.id;
        p.roads.push(edgeId);

        this.state.addLog(`${p.name} yol inşa etti.`, 'info');
        
        if (p.buildings.kervansaray > 0 && !p.achievements.kervansarayLv3First && p.buildings.kervansaray >= 4) {
             const othersLv3 = this.state.players.some(pl => pl.achievements.kervansarayLv3First);
             if (!othersLv3) p.achievements.kervansarayLv3First = true;
        }

        return true;
    }

    buildVillage(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);

        if (!p || !hex || hex.settlement) return false;
        
        const cost = BUILD_COSTS.koy;
        if (!p.canAfford(cost)) return false;

        if (!this.state.grid.getBuildableSettlementHexes(playerId).includes(hexId)) return false;

        p.spend(cost);
        hex.settlement = { playerId, type: 'koy', buildings: new Set() };
        p.settlements.push(hexId);
        
        this.state.recalcPopulation(p);
        this.state.updateVisibility();
        
        // İlk köy kurulduğunda her kaynaktan 1 adet ver
        if (p.settlements.length === 1) {
            RESOURCES.forEach(r => p.gain(r, 1));
            this.state.addLog(`🎁 ${p.name} ilk köyünü kurdu ve başlangıç kaynaklarını aldı!`, 'info');
        }
        
        this.state.addLog(`${p.name} yeni bir köy kurdu!`, 'success');
        this.state.checkVictory();
        return true;
    }

    buildBuilding(playerId, hexId, buildingType) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);

        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;
        if (hex.settlement.buildings.has(buildingType)) return false;

        let cost = {...BUILD_COSTS[buildingType]};

        // Tiyatro Seviye 1 Bonusu: Diğer yapılar -1 kaynak
        if (hex.settlement.buildings.has('tiyatro') && buildingType !== 'tiyatro') {
             const mostRes = Object.keys(cost).reduce((a, b) => cost[a] > cost[b] ? a : b);
             if (cost[mostRes]) cost[mostRes] = Math.max(0, cost[mostRes] - 1);
        }

        // Çiftlik Seviye 2B Bonusu: Çiftlik maliyeti her kaynakta -1
        if (buildingType === 'ciftlik' && p.buildingCounts.ciftlik >= 2) {
            Object.keys(cost).forEach(rk => {
                cost[rk] = Math.max(0, cost[rk] - 1);
            });
        }

        if (!p.canAfford(cost)) return false;

        p.spend(cost);
        hex.settlement.buildings.add(buildingType);
        
        this.state.upgradeSettlement(hexId);
        this.state.recalcBuildings(p);
        this.state.recalcPopulation(p);
        this.applyBuildingBonuses(p, buildingType);
        
        this.state.addLog(`${p.name}, ${BUILDING_NAMES[buildingType]} inşa etti.`, 'success');
        this.state.checkVictory();
        return true;
    }

    applyBuildingBonuses(player, type) {
        const count = player.buildings[type] || 0;
        let lv = 0;
        if (count >= 1) lv = 1;
        if (count >= 2) lv = 2;
        if (count >= 4) lv = 3;

        if (type === 'ciftlik') {
            if (lv >= 3 && !player.achievements.ciftlikLv3First) {
                player.bonusState.ciftlikPopBonus = 2;
                this.state.recalcPopulation(player);
                if (!this.state.players.some(p => p.achievements.ciftlikLv3First)) {
                    player.achievements.ciftlikLv3First = true;
                }
            }
        }
    }

    trainUnit(playerId, unitType, nodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const node = this.state.grid.nodes.get(nodeId);
        const udata = UNIT_DATA[unitType];

        if (!p || !node || !udata) return false;
        
        if (p.units.length >= p.maxPopulation) return false;

        let cost = udata.gold;
        if (unitType === 'sovalye' && p.bonusState.sovGoldReduction > 0) {
            cost = Math.max(1, cost - p.bonusState.sovGoldReduction);
        }

        if (p.gold < cost) return false;

        if (udata.cls === 'kusatma' && !p.bonusState.canBuildSiege) return false;

        p.gold -= cost;
        const currentUid = p.nextUnitId();
        const unit = { uid: currentUid, type: unitType, hp: 1, movesLeft: 0 }; 

        p.units.push({ ...unit, nodeId });

        if (!node.army) node.army = { playerId, units: [] };
        node.army.units.push(unit);

        this.state.addLog(`${p.name}, ${udata.name} üretti.`, 'info');
        return true;
    }

    moveUnit(playerId, unitUid, targetNodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unitDef = p?.units.find(u => u.uid === unitUid);
        if (!unitDef || unitDef.movesLeft <= 0) return false;

        const startNodeId = unitDef.nodeId;
        const targetNode = this.state.grid.nodes.get(targetNodeId);
        if (!targetNode) return false;

        const startNode = this.state.grid.nodes.get(startNodeId);
        if (!startNode.adjacentNodes.includes(targetNodeId)) return false; 

        // Hareket maliyeti hesapla
        const edgeId = this.state.grid.getEdgeBetweenNodes(startNodeId, targetNodeId);
        const edge = this.state.grid.edges.get(edgeId);
        const udata = UNIT_DATA[unitDef.type];
        
        let cost = 1.0;
        if (edge && edge.road === playerId && udata.cls !== 'kusatma') {
            cost = 0.5; // Kendi yolu +1 hız verir (maliyeti yarıya düşürür)
        }

        if (unitDef.movesLeft < cost) return false;

        const uIdx = startNode.army.units.findIndex(u => u.uid === unitUid);
        const movingUnit = startNode.army.units[uIdx]; 

        startNode.army.units.splice(uIdx, 1);
        if (startNode.army.units.length === 0) startNode.army = null;

        unitDef.movesLeft -= cost;
        movingUnit.movesLeft = unitDef.movesLeft;
        unitDef.nodeId = targetNodeId;

        if (targetNode.army && targetNode.army.playerId !== playerId) {
            if (udata.special === 'no_attack') {
                this.state.addLog(`⚠️ ${udata.name} saldırı yapamaz!`, 'warning');
                // Hareketi geri al
                unitDef.movesLeft += cost;
                unitDef.nodeId = startNodeId;
                if (!startNode.army) startNode.army = { playerId, units: [] };
                startNode.army.units.push(movingUnit);
                return false;
            }

            const combat = this.state.resolveCombat(movingUnit, p, targetNode);
            
            if (combat.casualty === 'attacker' || combat.casualty === 'both') {
                p.units = p.units.filter(u => u.uid !== unitUid);
            }
            
            if (combat.casualty === 'defender' || combat.casualty === 'both') {
                const defPlayer = this.state.players.find(pl => pl.id === targetNode.army.playerId);
                
                // Topçu ise 2 birim yok edebilir
                const killCount = (udata.special === 'multi_2') ? 2 : 1;
                for (let i = 0; i < killCount; i++) {
                    if (targetNode.army && targetNode.army.units.length > 0) {
                        const killed = targetNode.army.units.shift();
                        defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                    }
                }
                
                if (targetNode.army && targetNode.army.units.length === 0) {
                    targetNode.army = null;
                }
            }

            if (p.units.find(u => u.uid === unitUid) && !targetNode.army) {
                movingUnit.nodeId = targetNodeId;
                targetNode.army = { playerId: p.id, units: [movingUnit] };
            }
            
            this.state.recalcPopulation(p);
            this.state.updateVisibility();
            
            return combat; 
        }
 else {
            if (!targetNode.army) targetNode.army = { playerId, units: [] };
            targetNode.army.units.push(movingUnit);
            
            this.state.updateVisibility();
            
            targetNode.hexes.forEach(hid => {
                const hex = this.state.grid.hexes.get(hid);
                if (hex && hex.settlement && hex.settlement.playerId !== playerId) {
                    this.startSiege(playerId, targetNodeId, hid);
                }
            });
        }

        return true;
    }

    startSiege(playerId, attackerNodeId, targetHexId) {
        if (!this.state.sieges[targetHexId]) {
            this.state.sieges[targetHexId] = {
                attackerId: playerId,
                attackerNodeId: attackerNodeId,
                points: 1,
                turnsActive: 0
            };
            this.state.addLog(`🏰 ${targetHexId} yerleşimi kuşatma altına alındı!`, 'danger');
        } else {
            this.state.sieges[targetHexId].points++;
        }
        
        const req = this.state.calculateSiegeRequirement(targetHexId, playerId);
        if (this.state.sieges[targetHexId].points >= req) {
            this.resolveSiege(targetHexId);
        }
    }

    resolveSiege(targetHexId) {
        const siege = this.state.sieges[targetHexId];
        const hex  = this.state.grid.hexes.get(targetHexId);
        if (!siege || !hex || !hex.settlement) return;

        const oldOwner = this.state.players.find(p => p.id === hex.settlement.playerId);
        const newOwner = this.state.players.find(p => p.id === siege.attackerId);

        this.state.addLog(`🚩 ${hex.settlement.type} düştü! Yeni sahibi: ${newOwner.name}`, 'success');

        oldOwner.settlements = oldOwner.settlements.filter(id => id !== targetHexId);
        newOwner.settlements.push(targetHexId);
        hex.settlement.playerId = newOwner.id;

        delete this.state.sieges[targetHexId];
        this.state.checkVictory();
    }

    bankTrade(playerId, sellRes, sellAmount, buyRes) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        if (sellRes === 'gold') {
            // 1 altın -> 2 kaynak (Kervansaray Seviye 2, Seçenek A ise 3 kaynak)
            let rate = 2;
            if (p.chosenBonuses.kervansaray && p.chosenBonuses.kervansaray[2] === 'A') {
                rate = 3;
            }
            
            if (p.resources.gold < sellAmount) return false;
            p.spend({ gold: sellAmount });
            p.gain(buyRes, sellAmount * rate);
            this.state.addLog(`${p.name} bankaya ${sellAmount} altın verip ${sellAmount * rate} ${buyRes} aldı.`, 'info');
        } else {
            // 6 kaynak -> 1 altın
            const rate = 6; 
            if (p.resources[sellRes] < sellAmount) return false;
            if (sellAmount < rate) return false;

            const goldGained = Math.floor(sellAmount / rate);
            p.spend({ [sellRes]: goldGained * rate });
            p.gain('gold', goldGained);
            this.state.addLog(`${p.name} bankaya ${goldGained * rate} ${sellRes} verip ${goldGained} altın aldı.`, 'info');
        }
        return true;
    }

    rangeAttack(playerId, attackerUnitUid, targetNodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const attackerUnit = p.units.find(u => u.uid === attackerUnitUid);
        const targetNode = this.state.grid.nodes.get(targetNodeId);

        if (!attackerUnit || !targetNode || !targetNode.army || targetNode.army.playerId === playerId) return false;
        
        const udata = UNIT_DATA[attackerUnit.type];
        if (!udata.range) return false;
        if (attackerUnit.movesLeft <= 0) return false;

        // Mesafe kontrolü (1 menzil = 1 düğme)
        const sourceNode = this.state.grid.nodes.get(attackerUnit.nodeId);
        if (!sourceNode.adjacentNodes.includes(targetNodeId)) return false;

        const res = this.state.resolveRangeAttack(attackerUnit, p, targetNode);
        if (!res) return false;

        attackerUnit.movesLeft = 0; // Menzilli saldırı tüm hareketi tüketir

        if (res.casualty === 'defender') {
            const defPlayer = this.state.players.find(pl => pl.id === targetNode.army.playerId);
            
            // Topçu ise 2 birim yok edebilir
            const killCount = (udata.special === 'multi_2') ? 2 : 1;
            for (let i = 0; i < killCount; i++) {
                if (targetNode.army && targetNode.army.units.length > 0) {
                    const killed = targetNode.army.units.shift();
                    defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                }
            }
            
            if (targetNode.army && targetNode.army.units.length === 0) {
                targetNode.army = null;
            }
        }

        this.state.updateVisibility();
        return res;
    }

    chooseBonus(playerId, buildingType, level, choice) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;
        if (!p.chosenBonuses[buildingType]) p.chosenBonuses[buildingType] = {};
        p.chosenBonuses[buildingType][level] = choice;
        
        this.state.recalcPopulation(p);
        this.state.addLog(`${p.name} ${BUILDING_NAMES[buildingType]} ${level}. Seviye bonusu: ${choice}`, 'info');
        return true;
    }
}
