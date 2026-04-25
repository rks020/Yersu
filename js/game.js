'use strict';
// ============================================================
// Game — Ana uygulama yöneticisi
// ============================================================

class Game {
    constructor(playerConfigs, mapSizeKey) {
        try {
            // Core systems
            this.state    = new GameState(playerConfigs, mapSizeKey);
            this.actions  = new Actions(this.state);
            
            // Canvas & Renderer
            const canvas = document.getElementById('gameCanvas');
            if (!canvas) throw new Error("gameCanvas bulunamadı!");
            this.renderer = new Renderer(canvas, this.state);
            
            // UI & AI
            this.ui       = new UI(this.state, this.actions, this.renderer);
            this.aiEngine = new AIEngine(this.state, this.actions);

            this._initWindowResize();
            this.renderer.startAnimationLoop(); // FX Döngüsünü başlat
            this._start();
        } catch (err) {
            console.error("OYUN BAŞLATILAMADI:", err);
            alert("Oyun başlatılırken bir hata oluştu: " + err.message);
        }
    }

    _initWindowResize() {
        const resize = () => {
            const wrapper = document.getElementById('canvasWrapper');
            if (wrapper) {
                this.renderer.resize(wrapper.clientWidth, wrapper.clientHeight);
                this.renderer.render();
            }
        };
        window.addEventListener('resize', resize);
        resize(); // Initial fit
    }

    _start() {
        console.log("Yersu başlatıldı. Phase:", this.state.phase);
        this.state.addLog("Oyun Başladı! Setup aşaması.", "info");
        this.ui.showNotice("Yersu Dünyasına Hoş Geldiniz!", "success");
        this.ui.showNotice("📍 Bir köşeye TIKLAYARAK ilk köyünüzü kurun.", "info");

        // İlk tur başlangıç
        this.updateUI();

        // Eğer ilk oyuncu AI ise
        if (this.state.currentPlayer.isAI) {
            this.aiEngine.takeTurn();
        }
    }

    updateUI() {
        this.ui.update();
    }

    nextTurn() {
        this.state.nextTurn();
        this.updateUI();
        if (this.state.currentPlayer.isAI && !this.state.gameOver) {
            this.aiEngine.takeTurn();
        }
    }
}

// ─────────────────────────────────────────────────────────────
// LOBBY / MENU MANTIĞI
// `index.html` üzerinde çalışıp `game.html`'e geçişi sağlar
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Sadece game.html'de çalışsın
    if (document.getElementById('gameContainer')) {
        const urlParams = new URLSearchParams(window.location.search);
        
        // URL'den JSON config okuma
        const configStr = urlParams.get('config');
        let players = [];
        let sizeKey = 'orta';

        if (configStr) {
            try {
                const conf = JSON.parse(decodeURIComponent(configStr));
                players = conf.players;
                sizeKey = conf.mapSize;
            } catch(e) {
                console.error("Config parse error", e);
            }
        }

        // Fallback: parametre yoksa default 2 player
        if (!players || players.length < 2) {
            players = [
                { name: 'Oyuncu 1', colorId: 'red', isAI: false },
                { name: 'Yapay Zeka', colorId: 'blue', isAI: true }
            ];
        }

        // Oyunu global olarak başlat
        window.appMain = new Game(players, sizeKey);
        
        // FPS loop (animasyonlar vb. ekleneceği zaman bura kullanılabilir)
        // şimdilik sadece UI update içinde requestAnimationFrame ile render tetikleniyor.
    }
    
    // index.html lobby mantığı
    if (document.getElementById('lobbyContainer')) {
        const pCountSelect = document.getElementById('playerCount');
        const pList        = document.getElementById('playerList');
        const mapSize      = document.getElementById('mapSize');
        const startBtn     = document.getElementById('startBtn');

        const generatePlayerRows = (count) => {
            pList.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const isAI = i > 0; // ilk oyuncu hariç varsayılan AI
                const cIdx = i % PLAYER_COLORS.length;
                
                const div = document.createElement('div');
                div.className = 'player-row';
                div.innerHTML = `
                    <div class="input-group">
                        <label>Tip</label>
                        <select class="p-type input-style">
                            <option value="human" ${!isAI ? 'selected' : ''}>İnsan</option>
                            <option value="ai" ${isAI ? 'selected' : ''}>Bilgisayar (AI)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>İsim</label>
                        <input type="text" class="p-name input-style" value="${isAI ? 'Yapay Zeka ' + i : 'Sen'}">
                    </div>
                    <div class="input-group">
                        <label>Renk</label>
                        <select class="p-color input-style">
                            ${PLAYER_COLORS.map(c => `<option value="${c.id}" ${c.id === PLAYER_COLORS[cIdx].id ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </div>
                `;
                pList.appendChild(div);
            }
        };

        pCountSelect.addEventListener('change', (e) => {
            generatePlayerRows(parseInt(e.target.value));
        });

        startBtn.addEventListener('click', () => {
            const rows = pList.querySelectorAll('.player-row');
            const players = Array.from(rows).map((row, i) => {
                return {
                    isAI: row.querySelector('.p-type').value === 'ai',
                    name: row.querySelector('.p-name').value || `Oyuncu ${i+1}`,
                    colorId: row.querySelector('.p-color').value
                };
            });

            const conf = {
                mapSize: mapSize.value,
                players: players
            };

            const confStr = encodeURIComponent(JSON.stringify(conf));
            window.location.href = `game.html?config=${confStr}`;
        });

        // initial build
        generatePlayerRows(2);
    }
});
