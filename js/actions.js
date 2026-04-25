'use strict';

class Actions {
    constructor(state) {
        this.state = state;
    }

    setupSettleVillage(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || hex.settlement) return false;

        if (!this.state.grid.hexIsSettlable(hexId)) return false;
        if (this.state.grid.hexHasAdjacentSettlement(hexId)) return false;

        // Başlangıç kaynakları: Sadece o heksin verdiği kaynaklardan 3'er tane
        hex.resources.forEach(res => p.gain(res, 3));
        p.resources.gold += 3;
        
        hex.settlement = { playerId, type: 'koy', buildings: new Set() };
        p.settlements.push(hexId);
        p.setupDone = true;
        
        this.state.recalcPopulation(p);
        this.state.checkVictory();

        this.state.addLog(`${p.name} ilk köyünü kurdu ve kaynaklarını aldı.`, 'success');
        return true;
    }

    setupPlaceInitialUnit(playerId, nodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const node = this.state.grid.nodes.get(nodeId);
        if (!p || !node) return false;

        // Sadece kendi köyüne komşu bir düğmeye koyabilir
        const adjacentHexes = this.state.grid.getHexesAdjacentToNode(nodeId);
        const ownsAdjacent = adjacentHexes.some(hid => {
            const h = this.state.grid.hexes.get(hid);
            return h && h.settlement && h.settlement.playerId === playerId;
        });
        if (!ownsAdjacent) return false;

        const unit = { uid: p.nextUnitId(), type: 'kilicli', hp: 1, movesLeft: 0 };
        p.units.push({ ...unit, nodeId });
        
        if (!node.army) node.army = { playerId, units: [] };
        node.army.units.push(unit);

        this.state.addLog(`${p.name} ilk birliğini yerleştirdi.`, 'success');
        return true;
    }

    // ── Main Aşama Eylemleri ────────────────────────────────

    buildRoad(playerId, edgeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const edge = this.state.grid.edges.get(edgeId);
        if (!p || !edge || edge.road) return false;

        if (!p.canAfford(BUILD_COSTS.yol)) return false;

        // Yol inşa kuralı: Kendi yoluna veya yerleşimine bitişik olmalı
        const canBuild = this.state.grid.canPlayerBuildRoadAt(playerId, edgeId);
        if (!canBuild) return false;

        p.spend(BUILD_COSTS.yol);
        edge.road = { playerId };
        p.roads.push(edgeId);

        this.state.addLog(`${p.name} yol inşa etti.`, 'info');
        return true;
    }

    buildVillage(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || hex.settlement) return false;

        if (!p.canAfford(BUILD_COSTS.koy)) return false;

        // Köy kurma kuralı: O hexe yol ile bağlı olmalı
        const isConnected = this.state.grid.isHexConnectedByRoad(playerId, hexId);
        if (!isConnected) return false;

        if (this.state.grid.hexHasAdjacentSettlement(hexId)) return false;

        p.spend(BUILD_COSTS.koy);
        hex.settlement = { playerId, type: 'koy', buildings: new Set() };
        p.settlements.push(hexId);

        this.state.recalcPopulation(p);
        this.state.checkVictory();

        this.state.addLog(`${p.name} yeni bir köy kurdu.`, 'success');
        return true;
    }

    upgradeSettlement(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;

        const currentType = hex.settlement.type;
        let nextType = null;
        let cost = null;

        if (currentType === 'koy') {
            nextType = 'sehir';
            cost = BUILD_COSTS.sehir;
        } else if (currentType === 'sehir') {
            nextType = 'metropol';
            cost = BUILD_COSTS.metropol;
        }

        if (!nextType || !p.canAfford(cost)) return false;

        p.spend(cost);
        hex.settlement.type = nextType;

        this.state.recalcPopulation(p);
        this.state.checkVictory();

        this.state.addLog(`${p.name} yerleşimini ${nextType.toUpperCase()} seviyesine yükseltti.`, 'success');
        return true;
    }

    buildBuilding(playerId, hexId, buildingType) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;

        if (hex.settlement.buildings.has(buildingType)) return false;
        
        const cost = BUILD_COSTS[buildingType];
        if (!p.canAfford(cost)) return false;

        p.spend(cost);
        hex.settlement.buildings.add(buildingType);
        
        // Bonus state update
        this.state.applyBuildingBonus(p, buildingType);

        this.state.addLog(`${p.name} ${hexId} heksine ${BUILDING_NAMES[buildingType]} inşa etti.`, 'info');
        return true;
    }

    trainUnit(playerId, unitType, nodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const node = this.state.grid.nodes.get(nodeId);
        const udata = UNIT_DATA[unitType];

        if (!p || !node || !udata) return false;
        
        // 16 birim limiti kontrolü (Her oyuncu en fazla 16 birime sahip olabilir)
        if (p.units.length >= 16) {
            this.state.addLog(`⚠️ ${p.name} maksimum birim limitine (16) ulaştı!`, 'warning');
            return false;
        }

        if (p.units.length >= p.maxPopulation) return false;

        let cost = udata.gold;
        if (unitType === 'sovalye' && p.bonusState.sovGoldReduction > 0) {
            cost = Math.max(1, cost - p.bonusState.sovGoldReduction);
        }

        if (p.resources.gold < cost) return false;
        
        if (udata.cls === 'kusatma' && !p.bonusState.canBuildSiege) return false;

        p.resources.gold -= cost;
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
        
        // Komşu düğme kontrolü
        if (!startNode.adjacentNodes.includes(targetNodeId)) return false;

        const udata = UNIT_DATA[unitDef.type];
        let cost = 1;

        // Yol bonusu kontrolü
        const edgeId = this.state.grid.getEdgeBetweenNodes(startNodeId, targetNodeId);
        const edge = this.state.grid.edges.get(edgeId);
        if (edge && edge.road && edge.road.playerId === playerId && udata.cls === 'asker') {
            cost = 0.5;
        }

        if (unitDef.movesLeft < cost) return false;

        // Mevcut dümgeden çıkar
        const movingUnit = startNode.army.units.find(u => u.uid === unitUid);
        startNode.army.units = startNode.army.units.filter(u => u.uid !== unitUid);
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
            combat.animation = '⚔️';
            combat.isMelee = true;
            
            if (combat.casualty === 'attacker' || combat.casualty === 'both') {
                p.units = p.units.filter(u => u.uid !== unitUid);
            }
            
            if (combat.casualty === 'defender' || combat.casualty === 'both') {
                const defPlayer = this.state.players.find(pl => pl.id === targetNode.army.playerId);
                const killCount = (udata.special === 'multi_2') ? 2 : 1;
                for (let i = 0; i < killCount; i++) {
                    if (targetNode.army && targetNode.army.units.length > 0) {
                        const killed = targetNode.army.units.shift();
                        defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                        if (targetNode.army.units.length === 0) {
                            targetNode.army = null;
                            break;
                        }
                    }
                }
            }

            this.state.checkVictory();
            return combat;
        } else {
            if (!targetNode.army) targetNode.army = { playerId, units: [] };
            targetNode.army.units.push(movingUnit);
            return { type: 'move' };
        }
    }

    tradeWithBank(playerId, sellRes, buyRes) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        const rate = p.bonusState.bankRate;
        if (p.resources[sellRes] < rate) return false;

        p.resources[sellRes] -= rate;
        p.resources[buyRes] += 1;

        this.state.addLog(`${p.name} banka ile ticaret yaptı: ${rate} ${sellRes} -> 1 ${buyRes}`, 'info');
        return true;
    }

    chooseBonus(playerId, buildingType, level, choice) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        if (!p.chosenBonuses[buildingType]) p.chosenBonuses[buildingType] = {};
        p.chosenBonuses[buildingType][level] = choice;

        this.state.applyBuildingChoiceBonus(p, buildingType, level, choice);
        this.state.recalcPopulation(p);
        this.state.addLog(`${p.name} ${BUILDING_NAMES[buildingType]} ${level}. Seviye bonusu: ${choice}`, 'info');
        return true;
    }

    rangeAttack(playerId, unitUid, targetNodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unit = p?.units.find(u => u.uid === unitUid);
        if (!unit || unit.movesLeft <= 0) return false;

        const udata = UNIT_DATA[unit.type];
        if (!udata.range) return false;

        const targetNode = this.state.grid.nodes.get(targetNodeId);
        if (!targetNode || !targetNode.army || targetNode.army.playerId === playerId) return false;

        const startNode = this.state.grid.nodes.get(unit.nodeId);
        const dist = this.state.grid.getDistance(startNode.id, targetNode.id);
        
        if (dist > udata.range) {
            this.state.addLog("❌ Hedef çok uzakta!", "warning");
            return false;
        }

        unit.movesLeft -= 1;
        const combat = this.state.resolveCombat(unit, p, targetNode);
        combat.type = 'range';
        combat.animation = '🏹';
        
        if (combat.casualty === 'defender' || combat.casualty === 'both') {
            const defPlayer = this.state.players.find(pl => pl.id === targetNode.army.playerId);
            if (targetNode.army.units.length > 0) {
                const killed = targetNode.army.units.shift();
                defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                if (targetNode.army.units.length === 0) targetNode.army = null;
            }
        }
        
        this.state.checkVictory();
        return combat;
    }
}
