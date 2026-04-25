'use strict';
// ============================================================
// AI — Bilgisayar kontrollü rakipler için mantık
// ============================================================

class AIEngine {
    constructor(state, actions) {
        this.state = state;
        this.actions = actions;
    }

    takeTurn() {
        const player = this.state.currentPlayer;
        if (!player.isAI || this.state.gameOver) return false;

        console.log(`🤖 AI (${player.name}) Düşünüyor...`);

        setTimeout(() => {
            if (this.checkChoices(player)) {
                setTimeout(() => this.takeTurn(), 500);
                return;
            }

            if (this.state.phase === 'setup') {
                this.doSetupTurn(player);
            } else {
                this.doMainTurn(player);
            }
        }, 1000); 

        return true;
    }

    checkChoices(player) {
        if (player.pendingChoices.length > 0) {
            const choice = player.pendingChoices.shift();
            const pick = Math.random() > 0.5 ? 'A' : 'B';
            this.actions.chooseBonus(player.id, choice.type, choice.level, pick);
            return true;
        }
        return false;
    }

    doSetupTurn(player) {
        if (this.state.subPhase === 'production') {
            this.state.rollProductionDice();
            setTimeout(() => this.doSetupTurn(player), 1000);
            return;
        }

        if (this.state.subPhase === 'move') {
            if (!player.setupDone) {
                const unit = player.units[0];
                if (unit) {
                    const adjacentHexes = this.state.grid.getHexesAdjacentToNode(unit.nodeId);
                    const buildable = adjacentHexes.filter(hid => this.state.isHexBuildable(hid));
                    
                    if (buildable.length > 0) {
                        if (this.actions.buildVillage(player.id, buildable[0])) {
                             this.state.nextTurn();
                             return;
                        }
                    } 
                    
                    if (player.movesLeft > 0) {
                        const neighbors = this.state.grid.getNodeNeighbors(unit.nodeId);
                        const targetNode = neighbors[Math.floor(Math.random() * neighbors.length)];
                        this.actions.moveUnit(player.id, unit.uid, targetNode);
                        setTimeout(() => this.doSetupTurn(player), 500);
                        return;
                    }
                }
            }
        }

        this.state.nextTurn();
    }

    doMainTurn(player) {
        if (this.state.subPhase === 'production') {
            this.state.rollProductionDice();
            setTimeout(() => this.doMainTurn(player), 500);
            return;
        }

        // 1. Köy Kur
        if (player.canAfford(BUILD_COSTS.koy)) {
            const hexes = this.state.grid.getBuildableSettlementHexes(player.id);
            if (hexes.length > 0) {
                const target = hexes[Math.floor(Math.random() * hexes.length)];
                if (this.actions.buildVillage(player.id, target)) {
                    setTimeout(() => this.doMainTurn(player), 500);
                    return;
                }
            }
        }

        // 2. Yapı İnşa Et
        let built = false;
        for (const hexId of player.settlements) {
           for (const btype of ALL_BUILDINGS) {
               if (this.actions.buildBuilding(player.id, hexId, btype)) {
                   built = true;
                   break;
               }
           }
           if (built) break;
        }
        if (built) {
            setTimeout(() => this.doMainTurn(player), 500);
            return;
        }

        // 3. Yol Kur
        if (player.canAfford(BUILD_COSTS.yol)) {
            const edges = this.state.grid.getBuildableRoadEdges(player.id);
            if (edges.length > 0) {
                const edgeId = edges[Math.floor(Math.random() * edges.length)];
                if (this.actions.buildRoad(player.id, edgeId)) {
                    setTimeout(() => this.doMainTurn(player), 500);
                    return;
                }
            }
        }

        // 4. Asker Üret
        if (player.resources.gold >= 2 && player.units.length < player.maxPopulation) {
           if (player.settlements.length > 0) {
              const sid = player.settlements[Math.floor(Math.random() * player.settlements.length)];
              if(this.actions.trainUnit(player.id, 'kilicli', sid)) {
                  setTimeout(() => this.doMainTurn(player), 500);
                  return;
              }
           }
        }

        // Turu bitir
        this.state.nextTurn();
    }
}
