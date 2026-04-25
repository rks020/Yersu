'use strict';
// ============================================================
// Actions — Oyuncu eylemlerini (iş mantığını) yönetir
// ============================================================

class Actions {
    constructor(state) {
        this.state = state;
    }

    // ── Setup Aşaması Eylemleri ────────────────────────────────

    setupPlaceInitialUnit(playerId, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        if (!p) return false;

        const hex = this.state.grid.hexes.get(hexId);
        if (!hex) return false;

        if (hex.army) return false;

        const currentUid = p.nextUnitId();
        const unit = { uid: currentUid, type: 'kilicli', hp: 1, moved: false };

        p.units.push({ ...unit, hexId });
        hex.army = { playerId, units: [unit] };

        this.state.addLog(`${p.name} başlangıç askerini yerleştirdi.`, 'info');
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
        
        this.state.addLog(`${p.name} yeni bir köy kurdu!`, 'success');
        this.state.checkVictory();
        return true;
    }

    buildBuilding(playerId, hexId, buildingType) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);

        if (!p || !hex || !hex.settlement || hex.settlement.playerId !== playerId) return false;
        if (hex.settlement.buildings.has(buildingType)) return false;

        let cost = BUILD_COSTS[buildingType];

        if (hex.settlement.type !== 'koy' && p.bonusState.theatreCostReduction > 0) {
              let c = {...cost};
              const mostRes = Object.keys(c).reduce((a, b) => c[a] > c[b] ? a : b);
              c[mostRes] -= Math.min(c[mostRes], p.bonusState.theatreCostReduction);
              if (c[mostRes] <= 0) delete c[mostRes];
              cost = c;
        }

        if (buildingType === 'ciftlik' && p.bonusState.ciftlikCostReduction > 0) {
            let c = {...cost};
            Object.keys(c).forEach(rk => {
                c[rk] = Math.max(0, c[rk] - p.bonusState.ciftlikCostReduction);
                if (c[rk] === 0) delete c[rk];
            });
            cost = c;
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

    trainUnit(playerId, unitType, hexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const hex = this.state.grid.hexes.get(hexId);
        const udata = UNIT_DATA[unitType];

        if (!p || !hex || !udata) return false;
        
        if (p.units.length >= p.maxPopulation) return false;

        let cost = udata.gold;
        if (unitType === 'sovalye' && p.bonusState.sovGoldReduction > 0) {
            cost = Math.max(1, cost - p.bonusState.sovGoldReduction);
        }

        if (p.gold < cost) return false;

        if (udata.cls === 'kusatma' && !p.bonusState.canBuildSiege) return false;

        p.gold -= cost;
        const currentUid = p.nextUnitId();
        const unit = { uid: currentUid, type: unitType, hp: 1, moved: true }; 

        p.units.push({ ...unit, hexId });

        if (!hex.army) hex.army = { playerId, units: [] };
        hex.army.units.push(unit);

        this.state.addLog(`${p.name}, ${udata.name} üretti.`, 'info');
        return true;
    }

    moveUnit(playerId, unitUid, targetHexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unitDef = p?.units.find(u => u.uid === unitUid);
        if (!unitDef || unitDef.moved) return false;

        const startHexId = unitDef.hexId;
        const targetHex = this.state.grid.hexes.get(targetHexId);
        if (!targetHex) return false;

        const startHex = this.state.grid.hexes.get(startHexId);
        const uIdx = startHex.army.units.findIndex(u => u.uid === unitUid);
        const movingUnit = startHex.army.units[uIdx]; 

        let overwatchKiller = null;
        const checkOverwatch = (hexToCheck) => {
            if (hexToCheck.army && hexToCheck.army.playerId !== playerId) {
                const siegeUnit = hexToCheck.army.units.find(u => ['mancinik', 'topcu'].includes(u.type));
                if (siegeUnit) return { playerId: hexToCheck.army.playerId, unit: siegeUnit };
            }
            return null;
        };

        overwatchKiller = checkOverwatch(targetHex);
        if (!overwatchKiller) {
            for (const adjId of targetHex.adjacentHexes) {
                overwatchKiller = checkOverwatch(this.state.grid.hexes.get(adjId));
                if (overwatchKiller) break;
            }
        }

        if (overwatchKiller) {
            startHex.army.units.splice(uIdx, 1);
            if (startHex.army.units.length === 0) startHex.army = null;
            p.units = p.units.filter(u => u.uid !== unitUid);
            
            const defPlayer = this.state.players.find(pl => pl.id === overwatchKiller.playerId);
            this.state.addLog(`💥 ${p.name}'e ait ${UNIT_DATA[movingUnit.type].name}, düşman mancınığının menziline girdiği için yok edildi!`, 'danger');
            
            this.state.actionsDone.movedUnits.push(unitUid);
            this.state.recalcPopulation(p);
            this.state.updateVisibility();

            return {
                 type: 'overwatch',
                 attacker: { player: p, unit: movingUnit, id: playerId },
                 defender: { player: defPlayer, unit: overwatchKiller.unit, id: overwatchKiller.playerId },
                 winner: 'defender',
                 casualty: 'attacker'
            };
        }

        startHex.army.units.splice(uIdx, 1);
        if (startHex.army.units.length === 0) startHex.army = null;

        movingUnit.moved = true;
        unitDef.hexId = targetHexId;

        if (targetHex.army && targetHex.army.playerId !== playerId) {
            const combat = this.state.resolveCombat(movingUnit, p, targetHex);
            
            if (combat.casualty === 'attacker' || combat.casualty === 'both') {
                p.units = p.units.filter(u => u.uid !== unitUid);
            }
            
            if (combat.casualty === 'defender' || combat.casualty === 'both') {
                const defPlayer = this.state.players.find(pl => pl.id === targetHex.army.playerId);
                defPlayer.units = defPlayer.units.filter(u => u.uid !== targetHex.army.units[0].uid);
                targetHex.army.units.shift();
                
                if (targetHex.army.units.length === 0) {
                    targetHex.army = null;
                }
            }

            if (p.units.find(u => u.uid === unitUid) && !targetHex.army) {
                movingUnit.hexId = targetHexId;
                targetHex.army = { playerId: p.id, units: [movingUnit] };
            }
            
            this.state.actionsDone.movedUnits.push(unitUid);
            this.state.recalcPopulation(p);
            this.state.updateVisibility();
            
            return combat; 
        } else {
            if (!targetHex.army) targetHex.army = { playerId, units: [] };
            targetHex.army.units.push(movingUnit);
            
            this.state.updateVisibility();
            
            targetHex.adjacentHexes.forEach(ahid => {
                const adjHex = this.state.grid.hexes.get(ahid);
                if (adjHex && adjHex.settlement && adjHex.settlement.playerId !== playerId) {
                    this.startSiege(playerId, targetHexId, ahid);
                }
            });
        }

        return true;
    }

    startSiege(playerId, attackerHexId, targetHexId) {
        if (!this.state.sieges[targetHexId]) {
            this.state.sieges[targetHexId] = {
                attackerId: playerId,
                attackerHexId: attackerHexId,
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
            if (p.gold < sellAmount) return false;
            p.gold -= sellAmount;
            p.gain(buyRes, sellAmount * 1); 
            this.state.addLog(`${p.name} bankadan ${sellAmount} altın karşılığı ${sellAmount} ${buyRes} aldı.`, 'info');
        } else if (buyRes === 'gold') {
            if (p.resources[sellRes] < sellAmount) return false;
            const rate = p.bonusState.bankRate || BANK_TRADE_RATE; 
            if (sellAmount < rate) return false;

            const goldGained = Math.floor(sellAmount / rate);
            p.spend({ [sellRes]: goldGained * rate });
            p.gold += goldGained;
            this.state.addLog(`${p.name} bankaya ${goldGained * rate} ${sellRes} satarak ${goldGained} altın aldı.`, 'info');
        } else {
            const rate = 3; 
            if (p.resources[sellRes] < sellAmount) return false;
            if (sellAmount < rate) return false;

            const resGained = Math.floor(sellAmount / rate);
            p.spend({ [sellRes]: resGained * rate });
            p.gain(buyRes, resGained);
            this.state.addLog(`${p.name} bankaya ${resGained * rate} ${sellRes} verip ${resGained} ${buyRes} aldı.`, 'info');
        }
        return true;
    }

    attackHex(playerId, attackerUnitUid, targetHexId) {
        const p = this.state.players.find(pl => pl.id === playerId);
        const unit = p.units.find(u => u.uid === attackerUnitUid);
        const targetHex = this.state.grid.hexes.get(targetHexId);
        
        if (!unit || !targetHex || !targetHex.army) return false;
        if (targetHex.army.playerId === playerId) return false;
        
        const data = UNIT_DATA[unit.type];
        if (!data.range || data.range < 1) return false;
        
        const attackerHex = this.state.grid.hexes.get(unit.hexId);
        if (!attackerHex || !attackerHex.adjacentHexes.includes(targetHexId)) {
             return false; 
        }

        this.state.addLog(`🏹 ${p.name}, ${data.name} ile uzaktan saldırıyor!`, 'info');
        const combat = this.state.resolveCombat(unit, p, targetHex);
        
        if (combat.winner === 'attacker') {
            const defPlayer = this.state.players.find(pl => pl.id === targetHex.army.playerId);
            defPlayer.units = defPlayer.units.filter(u => u.uid !== targetHex.army.units[0].uid);
            targetHex.army.units.shift();
            if (targetHex.army.units.length === 0) targetHex.army = null;
            this.state.addLog(`🎯 İsabetli atış! Düşman birimi yok edildi.`, 'success');
        } else {
            this.state.addLog(`❌ Atış ıska geçti veya etkili olamadı.`, 'info');
            combat.winner = 'none';
            combat.casualty = 'none';
        }

        this.state.actionsDone.movedUnits.push(attackerUnitUid);
        return combat;
    }
}
