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
            if (this.state.phase === 'setup') {
                this.doSetupTurn(player);
            } else {
                this.doMainTurn(player);
            }
        }, 1000); 

        return true;
    }

    doSetupTurn(player) {
        if (!player.setupDone) {
            const buildableHexes = this.state.grid.getBuildableSettlementHexes(player.id, true);
            if (buildableHexes.length > 0) {
                const chosenHexId = buildableHexes[Math.floor(Math.random() * buildableHexes.length)];
                this.actions.setupSettleVillage(player.id, chosenHexId);
            }
        }

        const villageId = player.settlements[0];
        if (villageId) {
            this.actions.setupPlaceInitialUnit(player.id, villageId);
        }

        if (window.appMain) window.appMain.nextTurn();
        else this.state.nextTurn();
    }

    doMainTurn(player) {
        if (this.state.subPhase === 'production') {
            const roll = this.state.rollProductionDice();
            this.state.distributeResources(roll);
            this.state.subPhase = 'action';
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
        if (player.gold >= 2 && player.units.length < player.maxPopulation) {
           if (player.settlements.length > 0) {
              const sid = player.settlements[Math.floor(Math.random() * player.settlements.length)];
              if(this.actions.trainUnit(player.id, 'kilicli', sid)) {
                  setTimeout(() => this.doMainTurn(player), 500);
                  return;
              }
           }
        }

        // Turu bitir
        if (window.appMain) window.appMain.nextTurn();
        else this.state.nextTurn();
    }
}
