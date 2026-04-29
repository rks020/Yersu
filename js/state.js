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
            besin: 20,
            odun:  20,
            tas:   20,
            kil:   20,
            maden: 20,
            gold:  20
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
            ciftlikFixedCost: false,
            ciftlikSiegeBonus: false,
            roadCostReduction: 0,
            roadDiscountRes: null, // 'odun' veya 'tas'
            bankRate: 6,
            bankSellRate: 2,
            roadTax: false,
            spawnUnitXp: 0,
            sovGoldReduction: 0,
            canBuildSiege: false,
            tiyatroLv3SiegeReduction: false,
            theatreCostReduction: 0,
            muhendishaneSiegeBonus: false,
            topcuRangeBonus: 0,
            siegeInvulnerable: false,
            canChangeBiomeResource: false,
            kislaLv3BUsedThisTurn: false,
            kervansarayLv3Choice: null,
            pendingKervansarayRes: 0,
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
        this.initStartingResources();
    }

    initStartingResources() {
        this.players.forEach(p => {
            p.resources.besin = 20;
            p.resources.odun  = 20;
            p.resources.tas   = 20;
            p.resources.kil   = 20;
            p.resources.maden = 20;
            p.resources.gold  = 20;
        });
        this.addLog('🎁 Herkes başlangıç kaynakları aldı (her kaynaktan 20).', 'success');
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
            if (!hex || !hex.settlement || !hex.settlement.buildings) return;
            
            hex.settlement.buildings.forEach(b => {
                if (counts[b] !== undefined) counts[b]++;
            });

            // Seviye hesaplama: 3 yapı = Şehir, 6 yapı = Metropol
            const bCount = hex.settlement.buildings.size;
            if (bCount >= 6) {
                if (hex.settlement.type !== 'metropol') {
                    hex.settlement.type = 'metropol';
                    this.addLog(`🏛️ ${player.name} bir Metropol sahibi oldu!`, 'success');
                }
            } else if (bCount >= 3) {
                if (hex.settlement.type !== 'sehir') {
                    hex.settlement.type = 'sehir';
                    this.addLog(`🏰 ${player.name} bir Şehir sahibi oldu!`, 'success');
                }
            } else {
                hex.settlement.type = 'koy';
            }
        });

        const getLv = (c) => (c >= 4 ? 3 : (c >= 2 ? 2 : (c >= 1 ? 1 : 0)));

        ALL_BUILDINGS.forEach(b => {
            const oldLv = getLv(oldCounts[b] || 0);
            const newLv = getLv(counts[b]);
            
            if (newLv > oldLv) {
                // Eğer bu seviye için birden fazla seçenek varsa (Array ise), seçim gerekir
                const bonusInfo = BUILDING_BONUSES[b][newLv];
                if (Array.isArray(bonusInfo) && bonusInfo.length > 1) {
                    // Sadece bu seviye için daha önce seçim yapılmadıysa sor
                    const alreadyChosen = player.chosenBonuses && player.chosenBonuses[b] && player.chosenBonuses[b][newLv];
                    if (!alreadyChosen) {
                        player.pendingChoices.push({ type: b, level: newLv });
                    }
                }
            }

            if (!this.firstToLv3[b] && counts[b] >= 4) {
                this.firstToLv3[b] = player.id;
                this.addLog(`🏆 ${player.name} ${BUILDING_NAMES[b]} yapısını 3. seviyeye ulaştıran İLK oyuncu oldu!`, 'success');
            }
        });

        player.buildingCounts = counts; 
        player.buildings = counts;

        // Seviye 1 Pasif Bonusları Uygula
        player.bonusState.canBuildSiege     = (counts.muhendishane >= 1);
    }

    applyBuildingBonus(player, type) {
        // Seviye 1 bonusları otomatik uygulanır (bazıları distributeResources içinde)
        this.recalcBuildings(player);
        this.recalcPopulation(player);
        this.checkVictory();
    }

    applyBuildingChoiceBonus(player, type, level, choice) {
        if (!player.bonusState) return;

        if (type === 'ciftlik') {
            if (level === 2) {
                if (choice === 'A') player.bonusState.ciftlikResPerTurn = 1;
                else player.bonusState.ciftlikFixedCost = true;
            } else if (level === 3) {
                if (choice === 'A') player.bonusState.ciftlikPopBonus += 2;
                else player.bonusState.ciftlikSiegeBonus = true;
            }
        } else if (type === 'kervansaray') {
            if (level === 1) {
                if (choice === 'A') player.bonusState.roadDiscountRes = 'odun';
                else player.bonusState.roadDiscountRes = 'tas';
                player.bonusState.roadCostReduction = 1;
            } else if (level === 2) {
                if (choice === 'A') player.bonusState.bankSellRate = 3;
                else player.bonusState.roadTax = true;
            } else if (level === 3) {
                player.bonusState.kervansarayLv3Choice = choice;
            }
        } else if (type === 'kisla') {
            if (level === 1) {
                player.bonusState.kislaLv1Choice = choice; // A, B, veya C
            } else if (level === 2) {
                player.bonusState.kislaLv2Choice = choice;
                if (choice === 'A') player.bonusState.suvariSpeedBonus = 1;
                else player.bonusState.knightDuelBonus = 1;
            } else if (level === 3) {
                player.bonusState.kislaLv3Choice = choice;
            }
        } else if (type === 'muhendishane') {
            if (level === 2) {
                if (choice === 'A') player.bonusState.topcuRangeBonus = 1;
                else player.bonusState.canChangeBiomeResource = true;
            } else if (level === 3) {
                if (choice === 'A') player.bonusState.muhendishaneSiegeBonus = true;
                else player.bonusState.siegeInvulnerable = true;
            }
        } else if (type === 'tapinak') {
            if (level === 2) {
                if (choice === 'A') player.bonusState.enemySiegePenalty = 1;
                else player.bonusState.winOnDraw = true;
            } else if (level === 3) {
                if (choice === 'A') player.bonusState.sovGoldReduction += 1;
                else player.bonusState.freeRevive = true;
            }
        } else if (type === 'tiyatro') {
            if (level === 1) {
                player.bonusState.buildingCostReduction = 1;
            } else if (level === 2) {
                if (choice === 'A') player.bonusState.siegeDefection = true;
                else player.bonusState.tradeBonusRes = true;
            } else if (level === 3) {
                if (choice === 'A') player.bonusState.siegeReqReduction = 1;
                else player.bonusState.combatDefection = true;
            }
        }
        
        this.recalcPopulation(player);
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
            this.lastRoll.gained = this.distributeResources(this.lastRoll);
            // Main aşamada zar atılınca tüm birimlere hareket puanı ver
            this.currentPlayer.units.forEach(u => {
                const data = UNIT_DATA[u.type];
                let speed = data ? (data.speed || 1) : 1;
                if (this.currentPlayer.bonusState.suvariSpeedBonus && (u.type === 'hafif_suvari' || u.type === 'atli_okcu')) {
                    speed += this.currentPlayer.bonusState.suvariSpeedBonus;
                }
                u.movesLeft = speed;
            });
            this.subPhase = 'build'; // Üretimden sonra İnşa/Ticaret başlar
        }
        return this.lastRoll;
    }

    distributeResources(roll) {
        const total = roll.total;
        const gained = []; 

        this.grid.hexes.forEach(hex => {
            if (hex.number !== total) return;

            if (hex.settlement) {
                const owner = this.players.find(p => p.id === hex.settlement.playerId);
                if (owner) {
                    // Seviye 1 Çiftlik Bonusu: +1 Besin (Biyomda besin olmasına gerek yoktur)
                    if (hex.settlement.buildings.has('ciftlik')) {
                        owner.gain('besin', 1);
                        gained.push({ 
                            playerId: owner.id, 
                            res: 'besin', 
                            amount: 1, 
                            x: hex.center.x, 
                            y: hex.center.y 
                        });
                        this.addLog(`🚜 ${owner.name}, Çiftlik bonusundan +1 Besin kazandı.`, 'success');
                    }

                    if (hex.resources && hex.resources.length > 0) {
                        for (const res of hex.resources) {
                            let amount = 1; 
                            if (hex.settlement.type === 'sehir') amount = 2;
                            else if (hex.settlement.type === 'metropol') amount = 3;

                            owner.gain(res, amount);
                            gained.push({ 
                                playerId: owner.id, 
                                res, 
                                amount, 
                                x: hex.center.x, 
                                y: hex.center.y 
                            });
                            this.addLog(`🌾 ${owner.name}, ${hex.number} zarından ${amount} ${RESOURCE_INFO[res].name} kazandı.`, 'success');
                        }
                    }
                }
            }
        });

        this.players.forEach(p => {
            if (p.bonusState.ciftlikResPerTurn > 0) {
                p.gain('besin', p.bonusState.ciftlikResPerTurn);
                // Çiftlik bonusu için belirli bir konum yok, orta noktadan veya oyuncu merkezinden çıkabilir
                // Şimdilik konumsuz ekleyelim veya ilk yerleşiminden çıkaralım
                const firstSettlement = this.grid.hexes.get(p.settlements[0]);
                gained.push({ 
                    playerId: p.id, 
                    res: 'besin', 
                    amount: p.bonusState.ciftlikResPerTurn,
                    x: firstSettlement ? firstSettlement.center.x : 0,
                    y: firstSettlement ? firstSettlement.center.y : 0
                });
                this.addLog(`🌾 ${p.name}, Çiftlik bonusundan ${p.bonusState.ciftlikResPerTurn} besin kazandı.`, 'success');
            }

            // Kervansaray Sv 3-A: Her tur kasadan kaynak alma (Seçmeli)
            if (p.bonusState.kervansarayLv3Choice === 'A') {
                p.bonusState.pendingKervansarayRes = (p.bonusState.pendingKervansarayRes || 0) + 1;
                this.addLog(`🐪 ${p.name}, Kervansaray (Sv3-A) bonusundan 1 kaynak seçme hakkı kazandı.`, 'info');
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
                let speed = data.speed || 1;
                
                // Kışla Sv.2 A Bonusu: Hafif Süvari ve Atlı Okçu +1 Hız
                if (nextPlayer.chosenBonuses?.kisla?.[2] === 'A') {
                    if (u.type === 'hafif_suvari' || u.type === 'atli_okcu') {
                        speed += 1;
                    }
                }
                
                u.movesLeft = speed;
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
            const hex = this.grid.hexes.get(hexId);
            if (hex && hex.settlement) {
                const p = this.players.find(pl => pl.id === s.attackerId);
                if (p) {
                    let siegePower = 1;
                    // Ordu kontrolü (yerleşimin düğmelerinden birinde ordu var mı?)
                    hex.nodeIds.forEach(nid => {
                        const node = this.grid.nodes.get(nid);
                        if (node.army && node.army.playerId === s.attackerId) {
                            node.army.units.forEach(u => {
                                const udata = UNIT_DATA[u.type];
                                if (udata.siege) siegePower += udata.siege;
                            });
                        }
                    });

                    // Bonuslar
                    if (p.bonusState.muhendishaneSiegeBonus) siegePower += 1;
                    if (p.bonusState.ciftlikSiegeBonus) siegePower += 1;

                    // Zar Atışı
                    const aRoll = this._roll2d6();
                    const dRoll = this._roll2d6();
                    const aTotal = aRoll + (siegePower - 1); 
                    const dTotal = dRoll; // Savunan şimdilik sadece zar atıyor (Tapınak bonusu hariç)

                    this.addLog(`🏰 ${p.name} Kuşatma Atışı: [${aRoll}] + Güç(${siegePower-1}) = ${aTotal} vs Savunma: [${dRoll}]`, 'info');

                    if (aTotal > dTotal) {
                        s.points += 1;
                        this.addLog(`⚔️ Kuşatma ilerliyor! (${s.points} Puan)`, 'warning');
                    } else {
                        this.addLog(`🛡️ Savunma hattı aşılamadı.`, 'info');
                    }

                    const req = this.calculateSiegeRequirement(hexId, p.id);
                    if (s.points >= req) {
                        if (window.appMain && window.appMain.actions) {
                            window.appMain.actions.resolveSiege(hexId);
                        }
                    }
                }
            } else {
                delete this.sieges[hexId];
                this.addLog(`🏰 ${hexId} kuşatması kırıldı!`, 'info');
            }
        });

        // Tur sonu eylemleri
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

    resetTurnActions() {
        this.players.forEach(p => {
            p.bonusState.kislaLv3BUsedThisTurn = false;
        });
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
            // Sadece Şehir ve Metropolleri say
            let cityCount = 0;
            p.settlements.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (hex.settlement && (hex.settlement.type === 'sehir' || hex.settlement.type === 'metropol')) {
                    cityCount++;
                }
            });

            if (cityCount >= GAME_END_CITIES) {
                this.gameOver = true;
                p.isFinisher = true; 
                this.addLog(`🏁 OYUN BİTTİ! ${p.name} ${GAME_END_CITIES}. şehrini kurarak oyunu sona erdirdi.`, 'success');
                this.winner = this.getWinningPlayer(); 
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

        // --- GLOBAL KIŞLA BONUSLARI ---
        const kislaCount = player.buildings?.['kisla'] || 0;
        const kislaLv = kislaCount >= 4 ? 3 : kislaCount >= 2 ? 2 : kislaCount >= 1 ? 1 : 0;

        if (kislaLv >= 1) {
            const c1 = player.bonusState.kislaLv1Choice;
            if (c1 === 'A' && unit.type === 'mizrakci') strength += 1;
            else if (c1 === 'B' && unit.type === 'kilicli') strength += 1;
            else if (c1 === 'C' && unit.type === 'okcu') strength += 1;
        }

        if (kislaLv >= 2) {
            const c2 = player.bonusState.kislaLv2Choice;
            if (c2 === 'B' && unit.type === 'sovalye') strength += 1;
        }

        if (kislaLv >= 3) {
            const c3 = player.bonusState.kislaLv3Choice;
            if (c3 === 'A') strength += 1;
            else if (c3 === 'B' && ['kocbasi','mancinik','topcu'].includes(unit.type)) strength += 1;
        }

        // --- YEREL BONUSLAR (Tapınak vb.) ---
        if (node) {
            node.hexes.forEach(hid => {
                const hex = this.grid.hexes.get(hid);
                if (hex && hex.settlement && hex.settlement.playerId === player.id) {
                    if (this.sieges[hex.id] && hex.settlement.buildings.has('tapinak')) {
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

        this.addLog(`⚔️ SAVAŞ: ${aData.name} (Güç: ${aStr}) vs ${dData.name} (Güç: ${dStr}) [Zarlar: ${aRes.rolls} vs ${dRes.rolls}]`, 'info');

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

        // --- KIŞLA SV 3 B: RE-ROLL (LAST STAND) ---
        if (casualty === 'attacker') {
            const kislaCount = attackerPlayer.buildings?.['kisla'] || 0;
            if (kislaCount >= 4 && attackerPlayer.bonusState.kislaLv3Choice === 'B' && !attackerPlayer.bonusState.kislaLv3BUsedThisTurn) {
                attackerPlayer.bonusState.kislaLv3BUsedThisTurn = true;
                this.addLog(`🛡️ ${attackerPlayer.name}, Kışla (Sv3-B) ile son bir gayretle tekrar saldırıyor!`, 'warning');
                const reRes = this.calculateDuelStrength(attackerUnit, attackerPlayer, this.grid.nodes.get(attackerUnit.nodeId));
                let newAStr = reRes.total;
                if (aData.duelBonusVs && aData.duelBonusVs === dData.cls) newAStr += 1;
                this.addLog(`🎲 Yeniden Atış: [${reRes.rolls}] (Güç: ${newAStr}) vs Eski Savunma (${dStr})`, 'info');
                if (newAStr > dStr) {
                    winner = 'attacker';
                    casualty = 'defender';
                    this.addLog(`✨ MUCİZE! ${attackerPlayer.name} birimi dirildi ve rakibi bozguna uğrattı!`, 'success');
                } else {
                    this.addLog(`💀 İkinci deneme de başarısız oldu.`, 'danger');
                }
            }
        } else if (casualty === 'defender') {
            const kislaCount = defenderPlayer.buildings?.['kisla'] || 0;
            if (kislaCount >= 4 && defenderPlayer.bonusState.kislaLv3Choice === 'B' && !defenderPlayer.bonusState.kislaLv3BUsedThisTurn) {
                defenderPlayer.bonusState.kislaLv3BUsedThisTurn = true;
                this.addLog(`🛡️ ${defenderPlayer.name}, Kışla (Sv3-B) ile son bir gayretle tekrar savunuyor!`, 'warning');
                const reRes = this.calculateDuelStrength(defenderUnit, defenderPlayer, targetNode);
                let newDStr = reRes.total;
                if (dData.duelBonusVs && dData.duelBonusVs === aData.cls) newDStr += 1;
                this.addLog(`🎲 Yeniden Atış: [${reRes.rolls}] (Güç: ${newDStr}) vs Eski Saldırı (${aStr})`, 'info');
                if (newDStr > aStr) {
                    winner = 'defender';
                    casualty = 'attacker';
                    this.addLog(`✨ MUCİZE! ${defenderPlayer.name} birimi dirildi ve saldırganı yok etti!`, 'success');
                } else {
                    this.addLog(`💀 İkinci deneme de başarısız oldu.`, 'danger');
                }
            }
        }

        // --- MÜHENDİSHANE SV 3 B: KUŞATMA BİRİMİ KORUMASI ---
        if (casualty === 'defender' && defenderPlayer.bonusState.siegeInvulnerable && dData.cls === 'kusatma') {
            if (targetNode.settlement && targetNode.settlement.playerId === defenderPlayer.id) {
                casualty = 'none';
                this.addLog(`🛡️ ${defenderPlayer.name}, Mühendishane (Sv3-B) sayesinde kuşatma birimini ölümden kurtardı!`, 'success');
            }
        }

        return { 
            type: 'melee',
            attacker: { player: attackerPlayer, unit: attackerUnit, str: aStr, rolls: aRes.rolls },
            defender: { player: defenderPlayer, unit: defenderUnit, str: dStr, rolls: dRes.rolls },
            winner, 
            casualty 
        };
    }

    resolveRangeAttack(attackerUnit, attackerPlayer, targetNode, targetUnitOverride = null) {
        const defenderPlayerId = targetNode.army.playerId;
        const defenderPlayer   = this.players.find(p => p.id === defenderPlayerId);
        const defenderUnit     = targetUnitOverride || targetNode.army.units[0];
        
        if (!defenderUnit) return null;

        const aRes = this.calculateDuelStrength(attackerUnit, attackerPlayer, this.grid.nodes.get(attackerUnit.nodeId));
        const dRes = this.calculateDuelStrength(defenderUnit, defenderPlayer, targetNode);
        
        let aStr = aRes.total;
        let dStr = dRes.total;

        const aData = UNIT_DATA[attackerUnit.type];
        const dData = UNIT_DATA[defenderUnit.type];

        if (aData.duelBonusVs && aData.duelBonusVs === dData.cls) aStr += 1;
        if (dData.duelBonusVs && dData.duelBonusVs === aData.cls) dStr += 1;

        this.addLog(`🏹 MENZİLLİ: ${aData.name} (Güç: ${aStr}) vs ${dData.name} (Güç: ${dStr}) [Zarlar: ${aRes.rolls} vs ${dRes.rolls}]`, 'info');

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

        // --- MÜHENDİSHANE SV 3 B: KUŞATMA BİRİMİ KORUMASI ---
        if (casualty === 'defender' && defenderPlayer.bonusState.siegeInvulnerable && dData.cls === 'kusatma') {
            if (targetNode.settlement && targetNode.settlement.playerId === defenderPlayer.id) {
                casualty = 'none';
                this.addLog(`🛡️ ${defenderPlayer.name}, Mühendishane (Sv3-B) sayesinde kuşatma birimini ölümden kurtardı!`, 'success');
            }
        }

        return { 
            type: 'range',
            attacker: { player: attackerPlayer, unit: attackerUnit, str: aStr, rolls: aRes.rolls },
            defender: { player: defenderPlayer, unit: defenderUnit, str: dStr, rolls: dRes.rolls },
            winner, 
            casualty 
        };
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

    _roll2d6() {
        return (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);
    }
}
