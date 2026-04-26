'use strict';

class Actions {
    constructor(state) {
        this.state = state;
    }

    // ── Setup Aşaması ──────────────────────────────────────────────

    setupSettleVillage(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || hex.settlement) return false;

        if (!this.state.grid.hexIsSettlable(hexId)) return false;

        // Başlangıç kaynakları: 3 altın bonus
        hex.resources.forEach(res => p.gain(res, 3));
        p.resources.gold += 3;

        hex.settlement = { playerId, type: 'koy', buildings: new Set() };
        p.settlements.push(hexId);
        p.setupDone = true;

        this.state.recalcPopulation(p);
        this.state.checkVictory();

        this.state.addLog(`${p.name} ilk köyünü kurdu!`, 'success');
        return true;
    }

    setupPlaceInitialUnit(playerId, nodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const node = this.state.grid.nodes.get(nodeId);
        if (!p || !node) return false;

        // Node'un hexleri içinde oyuncunun köyü var mı? (node.hexes doğrudan kullanılıyor)
        const ownsAdjacent = node.hexes.some(hid => {
            const h = this.state.grid.hexes.get(hid);
            return h && h.settlement && h.settlement.playerId === playerId;
        });
        if (!ownsAdjacent) return false;

        const uid = p.nextUnitId();
        const unitData = { uid, type: 'kilicli', hp: 1, movesLeft: 0, nodeId };
        
        p.units.push(unitData);

        if (!node.army) node.army = { playerId, units: [] };
        node.army.units.push(unitData);

        this.state.addLog(`${p.name} ilk birliğini yerleştirdi.`, 'success');
        return true;
    }

    // ── Main Aşama Eylemleri ────────────────────────────────────────

    buildRoad(playerId, edgeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const edge = this.state.grid.edges.get(edgeId);
        if (!p || !edge || edge.road !== null) return false;
        let actualCost = {...BUILD_COSTS.yol};
        if (p.bonusState.roadCostReduction > 0) {
            actualCost.tas = Math.max(0, actualCost.tas - 1);
        }

        if (!p.canAfford(actualCost)) return false;

        // Yol kuralı: Kenarın en az bir ucunda oyuncunun yolu veya yerleşimi olmalı
        const n1Ok = this.state.grid.playerConnectedToNode(playerId, edge.node1)
                  || this.state.grid.nodeHasPlayerSettlement(playerId, edge.node1);
        const n2Ok = this.state.grid.playerConnectedToNode(playerId, edge.node2)
                  || this.state.grid.nodeHasPlayerSettlement(playerId, edge.node2);
        if (!n1Ok && !n2Ok) return false;

        p.spend(actualCost);
        edge.road = playerId;
        p.roads.push(edgeId);

        this.state.addLog(`${p.name} yol inşa etti.`, 'info');
        return true;
    }

    buildVillage(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || hex.settlement) return false;
        if (!p.canAfford(BUILD_COSTS.koy)) return false;
        if (!this.state.grid.hexIsSettlable(hexId)) return false;

        // Oyuncunun bu hexe yol bağlantısı var mı?
        if (!this.state.grid.playerConnectedToHex(playerId, hexId)) return false;

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

        if (currentType === 'koy') { nextType = 'sehir'; cost = BUILD_COSTS.sehir; }
        else if (currentType === 'sehir') { nextType = 'metropol'; cost = BUILD_COSTS.metropol; }

        if (!nextType || !p.canAfford(cost)) return false;

        p.spend(cost);
        hex.settlement.type = nextType;

        this.state.recalcPopulation(p);
        this.state.checkVictory();

        this.state.addLog(`${p.name} yerleşimini ${nextType.toUpperCase()} yaptı.`, 'success');
        return true;
    }

    buildBuilding(playerId, hexId, buildingType) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;
        if (hex.settlement.buildings.has(buildingType)) return false;

        const cost = BUILD_COSTS[buildingType];
        if (!cost) return false;

        let actualCost = {...cost};
        // Tiyatro Seviye 1 Bonusu: Maliyet -1 azalır (En pahalı kaynaktan düşelim)
        if (hex.settlement.buildings.has('tiyatro')) {
            let maxRes = null;
            let maxVal = -1;
            for (const [r, v] of Object.entries(actualCost)) {
                if (v > maxVal) { maxVal = v; maxRes = r; }
            }
            if (maxRes) actualCost[maxRes] = Math.max(0, actualCost[maxRes] - 1);
        }

        if (!p.canAfford(actualCost)) return false;

        p.spend(actualCost);
        hex.settlement.buildings.add(buildingType);

        this.state.applyBuildingBonus(p, buildingType);
        this.state.addLog(`${p.name} ${BUILDING_NAMES[buildingType]} inşa etti.`, 'info');
        return true;
    }

    trainUnit(playerId, unitType, nodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const node = this.state.grid.nodes.get(nodeId);
        const udata = UNIT_DATA[unitType];
        if (!p || !node || !udata) return false;

        // 16 birim limiti
        if (p.units.length >= 16) {
            this.state.addLog(`⚠️ ${p.name} maksimum birim limitine (16) ulaştı!`, 'warning');
            return false;
        }
        if (p.units.length >= p.maxPopulation) return false;

        let cost = udata.gold;
        if (unitType === 'sovalye' && p.bonusState && p.bonusState.sovGoldReduction > 0) {
            cost = Math.max(1, cost - p.bonusState.sovGoldReduction);
        }
        if (p.resources.gold < cost) return false;
        if (udata.cls === 'kusatma' && !(p.bonusState && p.bonusState.canBuildSiege)) return false;

        p.resources.gold -= cost;
        const uid = p.nextUnitId();
        const unitData = { uid, type: unitType, hp: 1, movesLeft: 0, nodeId };
        p.units.push(unitData);

        if (!node.army) node.army = { playerId, units: [] };
        node.army.units.push(unitData);

        this.state.addLog(`${p.name} ${udata.name} üretti.`, 'info');
        return true;
    }

    moveUnit(playerId, unitUid, targetNodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unitDef = p?.units.find(u => u.uid === unitUid);
        if (!unitDef || unitDef.movesLeft <= 0) return false;

        const startNodeId = unitDef.nodeId;
        const startNode = this.state.grid.nodes.get(startNodeId);
        const targetNode = this.state.grid.nodes.get(targetNodeId);
        if (!targetNode) return false;

        // Komşu düğme kontrolü
        if (!startNode.adjacentNodes.includes(targetNodeId)) return false;

        const udata = UNIT_DATA[unitDef.type];
        let cost = 3; // Patika (yol yok) maliyeti 3 MP
        const edgeId = this.state.grid.getEdgeBetweenNodes(startNodeId, targetNodeId);
        const edge = this.state.grid.edges.get(edgeId);
        if (edge && edge.road === playerId && udata.cls !== 'kusatma') {
            cost = 2; // Yol bonusu: Maliyet 2 MP
        }

        if (unitDef.movesLeft < cost) return false;

        // Mevcut node'dan çıkar
        const movingUnit = startNode.army.units.find(u => u.uid === unitUid);
        startNode.army.units = startNode.army.units.filter(u => u.uid !== unitUid);
        if (startNode.army.units.length === 0) startNode.army = null;

        unitDef.movesLeft -= cost;
        unitDef.nodeId = targetNodeId;

        // Düşman node'u mu?
        if (targetNode.army && targetNode.army.playerId !== playerId) {
            if (udata.special === 'no_attack') {
                // Hareketi geri al
                unitDef.movesLeft += cost;
                unitDef.nodeId = startNodeId;
                if (!startNode.army) startNode.army = { playerId, units: [] };
                startNode.army.units.push(movingUnit);
                this.state.addLog(`⚠️ ${udata.name} saldıramaz!`, 'warning');
                return false;
            }

            // Savaş
            const combat = this.state.resolveCombat(movingUnit, p, targetNode);
            combat.animation = '⚔️';

            if (combat.casualty === 'attacker' || combat.casualty === 'both') {
                p.units = p.units.filter(u => u.uid !== unitUid);
            } else {
                // Saldıran hayatta, hedef node'a gir
                if (!targetNode.army || combat.casualty === 'defender') {
                    if (!targetNode.army) targetNode.army = { playerId, units: [] };
                    else targetNode.army.playerId = playerId;
                    targetNode.army.units.push(movingUnit);
                }
            }

            if (combat.casualty === 'defender' || combat.casualty === 'both') {
                const defPlayer = this.state.players.find(pl => pl.id === targetNode.army?.playerId);
                if (defPlayer && targetNode.army) {
                    const killCount = (udata.special === 'multi_2') ? 2 : 1;
                    for (let i = 0; i < killCount && targetNode.army.units.length > 0; i++) {
                        const killed = targetNode.army.units.shift();
                        defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                    }
                    if (targetNode.army.units.length === 0) targetNode.army = null;
                }
                // Kazanan saldıran, node'a gir
                if (!targetNode.army) {
                    targetNode.army = { playerId, units: [movingUnit] };
                }
            }

            this.state.checkVictory();
            return combat;
        }

        // Dostane node veya boş node
        if (!targetNode.army) targetNode.army = { playerId, units: [] };
        targetNode.army.units.push(movingUnit);
        return { type: 'move' };
    }

    rangeAttack(playerId, unitUid, targetNodeId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unit = p?.units.find(u => u.uid === unitUid);
        if (!unit || unit.movesLeft <= 0) return false;

        const udata = UNIT_DATA[unit.type];
        if (!udata || !udata.range) return false;

        const targetNode = this.state.grid.nodes.get(targetNodeId);
        if (!targetNode || !targetNode.army || targetNode.army.playerId === playerId) return false;

        const dist = this.state.grid.getDistance(unit.nodeId, targetNodeId);
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
            if (defPlayer && targetNode.army.units.length > 0) {
                const killed = targetNode.army.units.shift();
                defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                if (targetNode.army.units.length === 0) targetNode.army = null;
            }
        }

        this.state.checkVictory();
        return combat;
    }

    tradeWithBank(playerId, sellRes, buyRes, buyRes2 = null) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        if (sellRes === 'gold') {
            // ALTIN SATIŞI: 1 Altın -> 2 (veya Kervansaray bonusuyla 3) Temel Kaynak
            if (p.resources.gold < 1) return false;
            
            const buyAmount = (p.bonusState && p.bonusState.goldToResRate) ? p.bonusState.goldToResRate : 2;
            
            p.resources.gold -= 1;
            
            // Eğer buyRes2 varsa, ikisinden de al. Yoksa sadece ilkini buyAmount kadar al.
            if (buyRes2 && buyRes2 !== buyRes) {
                p.gain(buyRes, Math.ceil(buyAmount / 2));
                p.gain(buyRes2, Math.floor(buyAmount / 2));
            } else {
                p.gain(buyRes, buyAmount);
            }
            
            this.state.addLog(`${p.name} 1 Altın bozdurarak kaynak aldı.`, 'info');
            return true;
        } else {
            // TEMEL KAYNAK SATIŞI: X:1 (Default 6:1)
            const rate = (p.bonusState && p.bonusState.bankRate) ? p.bonusState.bankRate : 6;
            if (p.resources[sellRes] < rate) return false;
            
            p.resources[sellRes] -= rate;
            p.gain(buyRes, 1);
            this.state.addLog(`${p.name} banka ticareti: ${rate} ${sellRes} → 1 ${buyRes}`, 'info');
            return true;
        }
    }

    tradeWithPlayer(fromId, toId, offer, request) {
        // offer / request: { besin:0, odun:0, tas:0, kil:0, maden:0, gold:0 }
        const from = this.state.players.find(pl => pl.id === fromId);
        const to   = this.state.players.find(pl => pl.id === toId);
        if (!from || !to || from === to) return false;

        // Kaynak kontrolü
        for (const [res, amt] of Object.entries(offer)) {
            if (amt > 0 && (from.resources[res] || 0) < amt) return false;
        }
        for (const [res, amt] of Object.entries(request)) {
            if (amt > 0 && (to.resources[res] || 0) < amt) return false;
        }

        // Transfer
        for (const [res, amt] of Object.entries(offer)) {
            if (amt > 0) { from.resources[res] -= amt; to.resources[res] = (to.resources[res] || 0) + amt; }
        }
        for (const [res, amt] of Object.entries(request)) {
            if (amt > 0) { to.resources[res] -= amt; from.resources[res] = (from.resources[res] || 0) + amt; }
        }

        const offerStr   = Object.entries(offer).filter(([,v])=>v>0).map(([r,v])=>`${v} ${r}`).join(', ');
        const requestStr = Object.entries(request).filter(([,v])=>v>0).map(([r,v])=>`${v} ${r}`).join(', ');
        this.state.addLog(`🤝 ${from.name} → ${to.name}: [${offerStr}] karşılığında [${requestStr}]`, 'success');
        return true;
    }

    chooseBonus(playerId, buildingType, level, choice) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        if (!p.chosenBonuses) p.chosenBonuses = {};
        if (!p.chosenBonuses[buildingType]) p.chosenBonuses[buildingType] = {};
        p.chosenBonuses[buildingType][level] = choice;

        if (typeof this.state.applyBuildingChoiceBonus === 'function') {
            this.state.applyBuildingChoiceBonus(p, buildingType, level, choice);
        }
        this.state.recalcPopulation(p);
        this.state.addLog(`${p.name} ${BUILDING_NAMES[buildingType]} ${level}. Seviye: ${choice}`, 'info');
        return true;
    }
}
