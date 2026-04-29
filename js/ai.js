'use strict';

class AIEngine {
    constructor(state, actions) {
        this.state = state;
        this.actions = actions;
    }

    takeTurn() {
        const player = this.state.currentPlayer;
        this.playTurn(player);
    }

    playTurn(player) {
        if (!player.isAI || this.state.gameOver) return;
        console.log(`🤖 AI Sırası: ${player.name} (${this.state.phase} - ${this.state.subPhase})`);

        // Seçim varsa yap
        if (this.handlePendingChoices(player)) return;

        if (this.state.phase === 'setup') {
            this.doSetupTurn(player);
        } else {
            this.doMainTurn(player);
        }
    }

    handlePendingChoices(player) {
        if (player.pendingChoices.length > 0) {
            const choice = player.pendingChoices.shift();
            const pick = Math.random() > 0.5 ? 'A' : 'B';
            console.log(`🤖 AI Seçim Yapıyor: ${choice.type} Sv.${choice.level} -> ${pick}`);
            this.actions.chooseBonus(player.id, choice.type, choice.level, pick);
            
            // Seçim sonrası tura devam et
            setTimeout(() => this.playTurn(player), 600);
            return true;
        }
        return false;
    }

    doSetupTurn(player) {
        if (this.state.subPhase === 'production') {
            this.state.rollProductionDice();
            setTimeout(() => this.doSetupTurn(player), 500);
            return;
        }

        // Setup aşamasında köy yoksa kur
        if (!player.setupDone) {
            const hexes = Array.from(this.state.grid.hexes.values())
                               .filter(h => this.state.grid.hexIsSettlable(h.id))
                               .map(h => h.id);
            if (hexes.length > 0) {
                const target = hexes[Math.floor(Math.random() * hexes.length)];
                if (this.actions.setupSettleVillage(player.id, target)) {
                    setTimeout(() => this.doSetupTurn(player), 500);
                    return;
                }
            }
        } else if (player.units.length === 0) {
            // Köy var ama asker yoksa asker koy
            const hexId = player.settlements[0];
            const hex = this.state.grid.hexes.get(hexId);
            if (hex) {
                const nodeId = hex.nodeIds[Math.floor(Math.random() * hex.nodeIds.length)];
                if (this.actions.setupPlaceInitialUnit(player.id, nodeId)) {
                    // UI'yı güncelle ve sıradaki oyuncuya geç
                    if (window.appMain) window.appMain.nextTurn();
                    else this.state.nextTurn();
                    return;
                }
            }
        }

        // Eğer buraya geldiyse ve hala setup'taysa bir sorun var demektir, turu geç
        if (this.state.phase === 'setup') {
            if (window.appMain) window.appMain.nextTurn();
            else this.state.nextTurn();
        }
    }

    doMainTurn(player) {
        if (this.state.subPhase === 'production') {
            const roll = this.state.rollProductionDice();
            if (window.appMain) window.appMain.updateUI();
            setTimeout(() => this.doMainTurn(player), 1200);
            return;
        }

        // 1. İnşaat ve Ticaret Aşaması
        if (this.state.subPhase === 'build') {
            // Köy Kur
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

            // Yapı İnşa Et
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

            // Yol Kur
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

            // Asker Üret
            if (player.resources.gold >= 2 && player.units.length < player.maxPopulation) {
                if (player.settlements.length > 0) {
                    const sid = player.settlements[Math.floor(Math.random() * player.settlements.length)];
                    const hex = this.state.grid.hexes.get(sid);
                    const nid = hex.nodeIds[0];
                    if (this.actions.trainUnit(player.id, 'kilicli', nid)) {
                        setTimeout(() => this.doMainTurn(player), 500);
                        return;
                    }
                }
            }

            // İnşaat bitti, harekete geç
            this.state.transitionToMove();
            setTimeout(() => this.doMainTurn(player), 500);
            return;
        }

        // 2. Hareket Aşaması
        if (this.state.subPhase === 'move') {
            const unitsWithMoves = player.units.filter(u => u.movesLeft > 0);
            if (unitsWithMoves.length > 0) {
                const unit = unitsWithMoves[0];
                const node = this.state.grid.nodes.get(unit.nodeId);
                const targetId = node.adjacentNodes[Math.floor(Math.random() * node.adjacentNodes.length)];
                
                // Kaynak Node'u kopyala (animasyon için)
                const sourceNodeId = unit.nodeId;
                const sourceNode = this.state.grid.nodes.get(sourceNodeId);
                const targetNode = this.state.grid.nodes.get(targetId);

                const res = this.actions.moveUnit(player.id, unit.uid, targetId);
                
                let delay = 500;
                if (!res) {
                    // Eğer hareket geçerli değilse, takılmasını önlemek için MP'sini sıfırla
                    unit.movesLeft = 0;
                } else if (res.type !== 'move') {
                    // Savaş gerçekleştiyse animasyon ve rapor göster
                    if (window.appMain && window.appMain.ui) {
                        window.appMain.ui.showCombatAnimation(sourceNode, targetNode, res);
                        window.appMain.ui.showCombatReport(res);
                        window.appMain.ui.update();
                    }
                    delay = 2800; // Savaş zarları (2.5s) kaybolana kadar bekle
                }

                // Hareket sonrası tekrar kontrol için
                setTimeout(() => this.doMainTurn(player), delay);
                return;
            }
        }

        // Turu bitir
        if (window.appMain) {
            window.appMain.nextTurn();
        } else {
            this.state.nextTurn();
        }
    }
}
