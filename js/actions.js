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
        const unitData = { uid, type: 'kilicli', hp: 1, movesLeft: 0, nodeId, playerId: p.id };

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
        let actualCost = { ...BUILD_COSTS.yol };
        if (p.bonusState.roadDiscountRes) {
            const res = p.bonusState.roadDiscountRes; // 'odun' veya 'tas'
            actualCost[res] = Math.max(0, actualCost[res] - 1);
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

    canBuildBuilding(playerId, hexId, buildingType) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;
        if (hex.settlement.buildings.has(buildingType)) return false;

        const cost = BUILD_COSTS[buildingType];
        if (!cost) return false;

        let actualCost = { ...cost };
        // Tiyatro Seviye 1 Bonusu: Eğer manuel bir indirim seçilmemişse, canBuild kontrolü için en pahalıyı düşelim
        if (hex.settlement.buildings.has('tiyatro')) {
            let maxRes = null;
            let maxVal = -1;
            for (const [r, v] of Object.entries(actualCost)) {
                if (v > maxVal && v > 0) { maxVal = v; maxRes = r; }
            }
            if (maxRes) actualCost[maxRes] = Math.max(0, actualCost[maxRes] - 1);
        }

        return p.canAfford(actualCost);
    }

    buildBuilding(playerId, hexId, buildingType, discountResource = null) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;
        if (hex.settlement.buildings.has(buildingType)) return false;

        const cost = BUILD_COSTS[buildingType];
        if (!cost) return false;

        let actualCost = { ...cost };

        // Çiftlik Seviye 2 (B) Bonusu: Maliyet sabit 6 besin
        if (buildingType === 'ciftlik' && p.bonusState.ciftlikFixedCost) {
            actualCost = { besin: 6 };
        }

        // Tiyatro Seviye 1 Bonusu: Maliyet -1 azalır
        if (hex.settlement.buildings.has('tiyatro')) {
            let resToDiscount = discountResource;
            
            // Eğer oyuncu bir seçim yapmadıysa (veya geçersizse), otomatik olarak en pahalıyı seç (fallback)
            if (!resToDiscount || !actualCost[resToDiscount]) {
                let maxVal = -1;
                for (const [r, v] of Object.entries(actualCost)) {
                    if (v > maxVal && v > 0) { maxVal = v; resToDiscount = r; }
                }
            }
            
            if (resToDiscount && actualCost[resToDiscount] > 0) {
                actualCost[resToDiscount] -= 1;
            }
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

        // MAX_POPULATION birim limiti
        if (p.units.length >= MAX_POPULATION) {
            this.state.addLog(`⚠️ ${p.name} maksimum birim limitine (${MAX_POPULATION}) ulaştı!`, 'warning');
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
        const unitData = { uid, type: unitType, hp: 1, movesLeft: 0, nodeId, hasAttacked: false, playerId: p.id };
        p.units.push(unitData);

        if (!node.army) node.army = { playerId, units: [] };
        node.army.units.push(unitData);

        this.state.addLog(`${p.name} ${udata.name} üretti.`, 'info');
        return true;
    }

    moveUnit(playerId, unitUid, targetNodeId, targetUnitUid = null, taxPaymentResource = null) {
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
        let cost = 1; // Temel maliyet 1 MP

        // İki node arasındaki kenarı bul
        const edge = Array.from(this.state.grid.edges.values()).find(e =>
            (e.node1 === startNodeId && e.node2 === targetNodeId) || (e.node1 === targetNodeId && e.node2 === startNodeId)
        );

        if (edge && edge.road !== null) {
            const roadOwner = this.state.players.find(rp => rp.id === edge.road);
            // Kendi yolum değilse ve yol sahibinin Kervansaray Sv.2 Bonus B'si varsa (Yol Vergisi)
            if (roadOwner && roadOwner.id !== playerId && roadOwner.bonusState.roadTax) {
                const basicRes = ['besin', 'odun', 'tas', 'kil', 'maden'];
                const availableRes = basicRes.filter(r => p.resources[r] > 0);
                
                if (availableRes.length > 0) {
                    if (!p.isAI && !taxPaymentResource) {
                        return { type: 'need_tax_selection', availableRes, roadOwner };
                    }
                    
                    const chosenRes = taxPaymentResource || availableRes[Math.floor(Math.random() * availableRes.length)];
                    if (!availableRes.includes(chosenRes)) return false; // Hile kontrolü

                    p.resources[chosenRes] -= 1;
                    roadOwner.gain(chosenRes, 1);
                    this.state.addLog(`💰 ${roadOwner.name}, ${p.name} oyuncusunun yolundan geçtiği için 1 ${RESOURCE_INFO[chosenRes].name} vergi aldı.`, 'info');
                }
            }

            let effectiveSpeed = udata.speed;
            if (p.bonusState.suvariSpeedBonus && (unitDef.type === 'hafif_suvari' || unitDef.type === 'atli_okcu')) {
                effectiveSpeed = 3;
            }

            // Yol hız bonusu: Sadece kendi yolumuzsa ve kuşatma birimi değilse bonus al
            if (udata.cls !== 'kusatma' && edge.road === playerId) {
                cost = effectiveSpeed / (effectiveSpeed + 1);
            }
        }

        const isCombat = targetNode.army && String(targetNode.army.playerId) !== String(playerId);
        if (!isCombat && unitDef.movesLeft < cost - 0.001) return false;

        // Mevcut node'dan çıkar
        const movingUnit = startNode.army.units.find(u => u.uid === unitUid);
        startNode.army.units = startNode.army.units.filter(u => u.uid !== unitUid);
        if (startNode.army.units.length === 0) startNode.army = null;

        unitDef.movesLeft = Math.max(0, unitDef.movesLeft - cost);
        unitDef.nodeId = targetNodeId;
        if (unitDef.playerId === undefined) unitDef.playerId = playerId; // Güvenlik için

        // Hedefte ordu varsa ekle, yoksa yeni ordu oluştur
        if (!targetNode.army) {
            targetNode.army = { playerId, units: [] };
        }
        targetNode.army.units.push(movingUnit);
        
        this.state.checkAllSiegesValidity();
        return { type: 'move' };
    }

    rangeAttack(playerId, unitUid, targetNodeId, targetUnitUid = null) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unit = p?.units.find(u => u.uid === unitUid);
        if (!unit || unit.hasAttacked) return false;

        const udata = UNIT_DATA[unit.type];
        if (!udata) return false;

        let actualRange = udata.range || 0;
        if (unit.type === 'topcu' && p.bonusState && p.bonusState.topcuRangeBonus) {
            actualRange += p.bonusState.topcuRangeBonus;
        }

        if (actualRange <= 0) return false;

        const targetNode = this.state.grid.nodes.get(targetNodeId);
        if (!targetNode || !targetNode.army) return false;

        // Hedefte en az bir düşman birimi olmalı
        const hasEnemy = targetNode.army.units.some(u => {
            const ownerId = u.playerId !== undefined ? u.playerId : targetNode.army.playerId;
            return ownerId !== playerId;
        });
        if (!hasEnemy) return false;

        const dist = this.state.grid.getDistance(unit.nodeId, targetNodeId);
        if (dist > actualRange) {
            this.state.addLog(`❌ Hedef çok uzakta! (Menzil: ${actualRange}, Mesafe: ${dist})`, "warning");
            return false;
        }

        unit.movesLeft = 0;
        unit.hasAttacked = true;

        const targetUnit = targetUnitUid ? targetNode.army.units.find(u => u.uid === targetUnitUid) : null;
        const combat = this.state.resolveRangeAttack(unit, p, targetNode, targetUnit);
        if (!combat) return false;
        combat.animation = '🏹';

        if (combat.casualty === 'defender') {
            const defPlayer = this.state.players.find(pl => pl.id === combat.defender.unit.playerId);
            const killed = combat.defender.unit;
            if (defPlayer && killed) {
                targetNode.army.units = targetNode.army.units.filter(u => u.uid !== killed.uid);
                if (targetNode.army.units.length === 0) targetNode.army = null;
                
                if (!defPlayer._deadThisTurn) defPlayer._deadThisTurn = [];
                defPlayer._deadThisTurn.push(JSON.parse(JSON.stringify(killed)));
                
                defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
            }
        }

        this.state.checkVictory();
        this.state.checkAllSiegesValidity();
        return combat;
    }

    performAttack(playerId, unitUid, targetNodeId, targetUnitUid = null) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unit = p?.units.find(u => u.uid === unitUid);
        if (!unit || unit.hasAttacked) return false;

        const targetNode = this.state.grid.nodes.get(targetNodeId);
        if (!targetNode || !targetNode.army) return false;

        // Hedefte en az bir düşman birimi olmalı
        const hasEnemy = targetNode.army.units.some(u => {
            const ownerId = u.playerId !== undefined ? u.playerId : targetNode.army.playerId;
            return String(ownerId) !== String(playerId);
        });
        if (!hasEnemy) return false;

        const dist = this.state.grid.getDistance(unit.nodeId, targetNodeId);
        const udata = UNIT_DATA[unit.type];

        let actualRange = udata.range;
        if (unit.type === 'topcu' && p.bonusState && p.bonusState.topcuRangeBonus) {
            actualRange += p.bonusState.topcuRangeBonus;
        }

        if (dist > actualRange) {
            this.state.addLog(`❌ ${udata.name} bu mesafeden saldıramaz! (Menzil: ${actualRange}, Mesafe: ${dist})`, 'warning');
            return false;
        }

        if (dist > 0) {
            return this.rangeAttack(playerId, unitUid, targetNodeId, targetUnitUid);
        }

        if (dist === 0) {
            if (udata.special === 'no_attack') {
                this.state.addLog(`⚠️ ${udata.name} saldıramaz!`, 'warning');
                return false;
            }

            unit.hasAttacked = true;
            unit.movesLeft = 0;

            const targetUnit = targetUnitUid ? targetNode.army.units.find(u => u.uid === targetUnitUid) : null;
            const combat = this.state.resolveCombat(unit, p, targetNode, targetUnit);
            combat.animation = '⚔️';

            if (combat.casualty === 'attacker') {
                const sourceNode = this.state.grid.nodes.get(unit.nodeId);
                if (sourceNode.army) {
                    sourceNode.army.units = sourceNode.army.units.filter(u => u.uid !== unitUid);
                    if (sourceNode.army.units.length === 0) sourceNode.army = null;
                }
                
                if (!p._deadThisTurn) p._deadThisTurn = [];
                p._deadThisTurn.push(JSON.parse(JSON.stringify(unit)));
                p.units = p.units.filter(u => u.uid !== unitUid);
                
            } else if (combat.casualty === 'defender') {
                const killed = combat.defender.unit;
                const defPlayerId = killed.playerId !== undefined ? killed.playerId : targetNode.army.playerId;
                const defPlayer = this.state.players.find(pl => pl.id === defPlayerId);
                
                if (defPlayer && killed) {
                    targetNode.army.units = targetNode.army.units.filter(u => u.uid !== killed.uid);
                    if (targetNode.army.units.length === 0) targetNode.army = null;
                    
                    if (!defPlayer._deadThisTurn) defPlayer._deadThisTurn = [];
                    defPlayer._deadThisTurn.push(JSON.parse(JSON.stringify(killed)));
                    defPlayer.units = defPlayer.units.filter(u => u.uid !== killed.uid);
                }
            }

            this.state.checkVictory();
            this.state.checkAllSiegesValidity();
            return combat;
        }

        return false;
    }

    tradeWithBank(playerId, sellRes, buyRes, buyRes2 = null, tradeCount = 1) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        console.log(`Bank Trade Request: ${p.name}, Sell:`, sellRes, `Buy: ${buyRes}, Count: ${tradeCount}`);

        // EĞER SELLRES BİR NESNEYSE (Karma Kaynak Takası)
        if (typeof sellRes === 'object' && sellRes !== null) {
            for (const [res, amount] of Object.entries(sellRes)) {
                if ((p.resources[res] || 0) < amount) {
                    console.warn(`Insufficient ${res}: have ${p.resources[res]}, need ${amount}`);
                    return false;
                }
            }

            for (const [res, amount] of Object.entries(sellRes)) {
                p.resources[res] -= amount;
            }

            p.gain(buyRes, tradeCount);
            this.state.addLog(`${p.name} banka ticareti: Karma kaynaklar → ${tradeCount} ${buyRes}`, 'info');
            this._triggerKervansarayTradeBonus([playerId]);
            return true;
        }

        // TEKLİ KAYNAK VEYA ALTIN TAKASI
        if (sellRes === 'gold') {
            if (p.resources.gold < tradeCount) return false;

            let buyAmount = p.bonusState.bankSellRate || 2;
            if (p.bonusState.bankSellRate === 3) buyAmount = 3; 

            const totalBuy = buyAmount * tradeCount;
            p.resources.gold -= tradeCount;

            if (buyRes2 && buyRes2 !== buyRes && buyRes2 !== '') {
                p.gain(buyRes, Math.ceil(totalBuy / 2));
                p.gain(buyRes2, Math.floor(totalBuy / 2));
            } else {
                p.gain(buyRes, totalBuy);
            }

            this.state.addLog(`${p.name} ${tradeCount} Altın bozdurarak ${totalBuy} kaynak aldı.`, 'info');
            this._triggerKervansarayTradeBonus([playerId]);
            return true;
        } else {
            const rate = (p.bonusState && p.bonusState.bankRate) ? p.bonusState.bankRate : 6;
            const totalSell = rate * tradeCount;
            if ((p.resources[sellRes] || 0) < totalSell) return false;

            p.resources[sellRes] -= totalSell;
            p.gain(buyRes, tradeCount);
            this.state.addLog(`${p.name} banka ticareti: ${totalSell} ${sellRes} → ${tradeCount} ${buyRes}`, 'info');
            this._triggerKervansarayTradeBonus([playerId]);
            return true;
        }
    }

    _triggerKervansarayTradeBonus(actingPlayerIds) {
        this.state.players.forEach(p => {
            if (!actingPlayerIds.includes(p.id) && p.bonusState && p.bonusState.kervansarayLv3Choice === 'B') {
                p.bonusState.pendingKervansarayRes = (p.bonusState.pendingKervansarayRes || 0) + 1;
                this.state.addLog(`🐪 ${p.name}, ticaret vergisinden Kervansaray (Sv3-B) ile 1 kaynak seçme hakkı kazandı.`, 'info');
            }
        });
    }

    tradeWithPlayer(fromId, toId, offer, request) {
        // offer / request: { besin:0, odun:0, tas:0, kil:0, maden:0, gold:0 }
        const from = this.state.players.find(pl => pl.id === fromId);
        const to = this.state.players.find(pl => pl.id === toId);
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

        const offerStr = Object.entries(offer).filter(([, v]) => v > 0).map(([r, v]) => `${v} ${r}`).join(', ');
        const requestStr = Object.entries(request).filter(([, v]) => v > 0).map(([r, v]) => `${v} ${r}`).join(', ');
        this.state.addLog(`🤝 ${from.name} → ${to.name}: [${offerStr}] karşılığında [${requestStr}]`, 'success');
        this._triggerKervansarayTradeBonus([fromId, toId]);
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

    // ── Kuşatma Mekanikleri ────────────────────────────────────────

    startSiege(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex || !hex.settlement || hex.settlement.playerId === playerId) return false;

        // Zaten kuşatılıyor mu?
        if (this.state.sieges[hexId]) {
            this.state.addLog("⚠️ Bu yerleşim zaten kuşatma altında!", "warning");
            return false;
        }

        // Bitişikte ordu var mı kontrolü
        let hasArmy = false;
        hex.nodeIds.forEach(nid => {
            const node = this.state.grid.nodes.get(nid);
            if (node.army && node.army.playerId === playerId) hasArmy = true;
        });

        if (!hasArmy) {
            this.state.addLog("⚠️ Kuşatma başlatmak için yerleşim dibinde ordunuz olmalı!", "warning");
            return false;
        }

        const defender = this.state.players.find(pl => pl.id === hex.settlement.playerId);
        this.state.sieges[hexId] = {
            attackerId: playerId,
            points: 0,
            turnCount: 0,
            startTime: Date.now()
        };

        this.state.addLog(`🏰 ${p.name}, ${defender.name} oyuncusunun yerleşimini KUŞATTI!`, 'warning');
        return true;
    }

    resolveSiege(hexId) {
        const hex = this.state.grid.hexes.get(hexId);
        if (!hex || !hex.settlement) return false;

        const siege = this.state.sieges[hexId];
        if (!siege) return false;

        const attackerId = siege.attackerId;
        const defenderId = hex.settlement.playerId;
        const attacker = this.state.players.find(p => p.id === attackerId);
        const defender = this.state.players.find(p => p.id === defenderId);

        if (!attacker || !defender) return false;

        // Yerleşim sahibini değiştir
        const oldType = hex.settlement.type;
        hex.settlement.playerId = attackerId;

        // Bazı binalar yıkılır (Opsiyonel: %50 ihtimalle her bina yıkılabilir veya sadece hepsi silinebilir)
        // Burada basitlik adına binaları koruyoruz ama "Metropol" ise "Şehir"e düşürebiliriz
        if (hex.settlement.type === 'metropol') hex.settlement.type = 'sehir';

        // Oyuncu listelerini güncelle
        attacker.settlements.push(hexId);
        defender.settlements = defender.settlements.filter(id => id !== hexId);

        // Kuşatmayı kaldır
        delete this.state.sieges[hexId];

        this.state.addLog(`🚩 ${attacker.name}, ${defender.name} yerleşimini ELE GEÇİRDİ!`, 'success');

        this.state.recalcBuildings(attacker);
        this.state.recalcBuildings(defender);
        this.state.recalcPopulation(attacker);
        this.state.recalcPopulation(defender);
        this.state.checkVictory();
        return true;
    }

    changeHexResource(playerId, hexId, newRes) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        if (!p || !hex) return false;

        // Bonus kontrolü: Mühendishane Seviye 2 (B)
        if (!p.bonusState.canChangeBiomeResource) {
            this.state.addLog("⚠️ Bu eylem için Mühendishane Seviye 2 (B) bonusu gerekli!", "warning");
            return false;
        }

        // Sadece kendi yerleşiminin olduğu veya komşu olduğu hexleri değiştirebilir (isteğe bağlı kısıtlama)
        // Şimdilik sadece yerleşiminin olduğu hexlerde izin verelim
        if (!hex.settlement || hex.settlement.playerId !== playerId) {
            this.state.addLog("⚠️ Sadece kendi yerleşiminizin olduğu bölgelerin kaynağını değiştirebilirsiniz.", "warning");
            return false;
        }

        if (!RESOURCES.includes(newRes)) return false;

        const oldRes = hex.resources[0] || "Yok";
        hex.resources = [newRes]; // Kaynağı değiştir

        this.state.addLog(`⚙️ ${p.name}, Mühendishane sayesinde ${hex.id} bölgesinin kaynağını ${oldRes.toUpperCase()} -> ${newRes.toUpperCase()} yaptı.`, "info");
        return true;
    }

    executeSiegeDefection(unitUid, hexId) {
        const s = this.state.sieges[hexId];
        if (!s) return;
        
        let unitToTransfer = null;
        let attacker = this.state.players.find(p => p.id === s.attackerId);
        let defender = null;
        
        const hex = this.state.grid.hexes.get(hexId);
        if (hex && hex.settlement) {
            defender = this.state.players.find(p => p.id === hex.settlement.playerId);
        }
        
        if (!attacker || !defender) return;
        
        unitToTransfer = attacker.units.find(u => u.uid === unitUid);
        if (!unitToTransfer) return;
        
        // Attacker'dan çıkar
        attacker.units = attacker.units.filter(u => u.uid !== unitUid);
        
        // Taraf değiştiren birimi defender'a ekle
        unitToTransfer.playerId = defender.id;
        defender.units.push(unitToTransfer);
        
        // Birim bulunduğu node'da kalmaya devam eder. 
        // Renderer artık aynı node'da farklı oyuncu birimlerini gösterebildiği için ek işlem gerekmez.
        
        this.state.addLog(`🎭 Tiyatro Bonusu: ${attacker.name}'ın bir birimi (${UNIT_DATA[unitToTransfer.type].name}) taraf değiştirerek ${defender.name}'a katıldı!`, 'success');
        s.turnCount = 0;
        
        if (window.appMain && window.appMain.ui) {
            window.appMain.ui.update();
            window.appMain.ui.showNotice("Taraf değişikliği gerçekleşti!", "success");
        }
    }
}
