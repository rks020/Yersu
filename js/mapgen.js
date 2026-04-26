'use strict';
// ============================================================
// MapGen — Biyom, kaynak ve numara ataması
// ============================================================

class MapGen {
    /**
     * @param {HexGrid} grid
     */
    static generate(grid) {
        const hexList = [...grid.hexes.values()];
        const total   = hexList.length;
        const R       = grid.radius;

        // ── 1. Biyom dağılımı ────────────────────────────────────
        // Zorunlu: 2 Çöl, 2 Bataklık
        // Geriye kalan: production biyomlar — her 5 kaynak türü eşit sayıda

        const specialSlots   = MapGen._pickSpecialHexes(grid, hexList);
        const productionSlots = hexList.filter(h => !specialSlots.has(h.id));

        // Production biyomları — her kaynaktan eşit sayıda üretici olmalı
        const prodBiomes = MapGen._balancedProductionBiomes(productionSlots.length);

        // Karıştır ve ata
        MapGen._shuffle(prodBiomes);
        productionSlots.forEach((hex, i) => {
            hex.biome = prodBiomes[i];
        });
        specialSlots.forEach((isBataklik, hid) => {
            grid.hexes.get(hid).biome = isBataklik ? 'bataklik' : 'col';
        });

        // ── 2. Kaynak ataması ────────────────────────────────────
        MapGen._assignBalancedResources(grid, productionSlots);

        // ── 3. Numara ataması (2-12, 7 yok, 6/8 komşu değil) ───
        const productionHexIds = productionSlots.map(h => h.id);
        MapGen._assignNumbers(grid, productionHexIds);
    }

    // ── Özel hex seçimi (Çöl, Bataklık) ──────────────────────────

    static _pickSpecialHexes(grid, hexList) {
        // Köşe ve kenar hexlerden özel olanları seç
        const result = new Map(); // hexId → isBataklik(bool)

        // Iç hexleri atla, kenar hexlerden seçmeye çalış
        const borderHexes = hexList.filter(h =>
            Math.abs(h.q) === grid.radius ||
            Math.abs(h.r) === grid.radius ||
            Math.abs(h.q + h.r) === grid.radius
        );
        const pool = [...borderHexes];
        MapGen._shuffle(pool);

        // 2 Bataklık: birbirinden en az 2 hex uzakta
        let bataklikCount = 0;
        const chosen = [];
        for (const hex of pool) {
            if (chosen.every(ch => Math.abs(ch.q - hex.q) + Math.abs(ch.r - hex.r) >= 2)) {
                chosen.push(hex);
                result.set(hex.id, bataklikCount < 2);
                bataklikCount++;
                if (result.size === 4) break; // 2 Bataklık + 2 Çöl
            }
        }

        // Yeterli kenar hex yoksa iç hexlerden tamamla
        if (result.size < 4) {
            for (const hex of hexList) {
                if (!result.has(hex.id)) {
                    result.set(hex.id, result.size % 2 === 0);
                    if (result.size === 4) break;
                }
            }
        }

        return result;
    }

    // ── Production biyomları dengeli dağıt ───────────────────────

    static _balancedProductionBiomes(count) {
        // 6 biyom × 5 kaynak eşleşmesi — her kaynak için eşit üretici
        // Biyomlar: ova(besin+kil), koruluk(besin+odun), daglik(tas+maden),
        //           cayir(besin+odun), kumsal(tas+kil), vaha(besin+maden)

        // Her biyom eşit oranda olsun
        const biomes  = PRODUCTION_BIOMES;
        const result  = [];
        const perBiome = Math.floor(count / biomes.length);
        const extra    = count % biomes.length;

        biomes.forEach((b, i) => {
            const cnt = perBiome + (i < extra ? 1 : 0);
            for (let j = 0; j < cnt; j++) result.push(b);
        });

        return result;
    }

    // ── Dengeli Kaynak Ataması ────────────────────────────────────

    static _assignBalancedResources(grid, productionSlots) {
        // 1. Sabit kaynakların toplam sayılarını hesapla
        const counts = {};
        RESOURCES.forEach(r => counts[r] = 0);

        productionSlots.forEach(hex => {
            const info = BIOME_INFO[hex.biome];
            if (info && info.fixedRes) {
                info.fixedRes.forEach(r => counts[r]++);
            }
        });

        // 2. Her hex için 1 adet değişken kaynak havuzu oluştur
        // Toplamda her kaynağın haritadaki toplam "üretim merkezi" (hex) sayısını eşitlemeye çalış
        const variablePool = [];
        const n = productionSlots.length;

        const currentTotal = {};
        RESOURCES.forEach(r => currentTotal[r] = counts[r]);

        for (let i = 0; i < n; i++) {
            // Şu an en az olan kaynağı bul ve havuza ekle
            let bestRes = RESOURCES[0];
            let minVal = Infinity;

            RESOURCES.forEach(r => {
                if (currentTotal[r] < minVal) {
                    minVal = currentTotal[r];
                    bestRes = r;
                }
            });

            variablePool.push(bestRes);
            currentTotal[bestRes]++;
        }

        // 3. Karıştır ve ata
        MapGen._shuffle(variablePool);
        productionSlots.forEach((hex, i) => {
            const info = BIOME_INFO[hex.biome];
            hex.resources = [...info.fixedRes, variablePool[i]];
        });
        
        // Kaynak üretmeyen hex'leri temizle
        grid.hexes.forEach(hex => {
            if (!PRODUCTION_BIOMES.includes(hex.biome)) {
                hex.resources = [];
            }
        });
    }

    // ── Numara ataması ────────────────────────────────────────────

    static _assignNumbers(grid, hexIds) {
        // 2-12 arası sayılar (7 hariç), birden fazla kullanılabilir
        // Kural: 6 ve 8'ler komşu hexlere koyulamaz
        const numbers = MapGen._buildNumberPool(hexIds.length);
        MapGen._shuffle(numbers);

        // Önce 6, 7 ve 8'leri yerleştir, ardından geri kalanı
        const hot   = numbers.filter(n => n === 6 || n === 7 || n === 8);
        const rest  = numbers.filter(n => n !== 6 && n !== 7 && n !== 8);

        const assigned = new Map(); // hexId → number

        // 6, 7 ve 8'leri komşu olmayacak şekilde yerleştir
        const hotHexes = MapGen._placeHotNumbers(grid, hexIds, hot);
        hotHexes.forEach(({ hexId, num }) => assigned.set(hexId, num));

        // Geri kalanları kalan hexlere ata
        const remaining = hexIds.filter(id => !assigned.has(id));
        remaining.forEach((id, i) => assigned.set(id, rest[i] || 5));

        // Hexlere yaz
        assigned.forEach((num, id) => {
            const h = grid.hexes.get(id);
            if (h) h.number = num;
        });
    }

    static _placeHotNumbers(grid, hexIds, hot) {
        const result  = [];
        const usedIds = new Set();

        for (const num of hot) {
            // Komşusu olmayan bir hex bul
            let placed = false;
            for (const hid of hexIds) {
                if (usedIds.has(hid)) continue;
                const h = grid.hexes.get(hid);
                if (!h) continue;
                const adjHot = h.adjacentHexes.some(aid => usedIds.has(aid));
                if (!adjHot) {
                    result.push({ hexId: hid, num });
                    usedIds.add(hid);
                    placed = true;
                    break;
                }
            }
            // Yerleştiremedik, zorunlu yerleştir
            if (!placed) {
                for (const hid of hexIds) {
                    if (!usedIds.has(hid)) {
                        result.push({ hexId: hid, num });
                        usedIds.add(hid);
                        break;
                    }
                }
            }
        }
        return result;
    }

    static _buildNumberPool(count) {
        // 2-12 arası sayılar (7 dahil)
        // Kural: 2 ve 12'den kesinlikle 1 adet olmalı.
        // Diğerlerinden (3,4,5,6,7,8,9,10,11) eşit dağıtılmalı.
        const mustInclude = [2, 12];
        const others = [3, 4, 5, 6, 7, 8, 9, 10, 11];
        
        const result = [...mustInclude];
        
        // Önce her rakamdan birer tane daha ekle (eşitlik için)
        others.forEach(n => result.push(n));
        
        // Kalan boşlukları others ile doldur
        while (result.length < count) {
            MapGen._shuffle(others);
            for (const n of others) {
                if (result.length >= count) break;
                result.push(n);
            }
        }
        
        return result.slice(0, count);
    }

    // ── Yardımcılar ───────────────────────────────────────────────

    static _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    static _pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
}
