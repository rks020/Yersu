'use strict';

// ==================== KAYNAKLAR ====================
const RESOURCES = ['besin', 'odun', 'tas', 'kil', 'maden'];

const RESOURCE_INFO = {
    besin:  { name: 'Besin',  color: '#7CB342', emoji: '🌾', icon: '🌾' },
    odun:   { name: 'Odun',   color: '#8D6E63', emoji: '🪵', icon: '🪵' },
    tas:    { name: 'Taş',    color: '#90A4AE', emoji: '🪨', icon: '🪨' },
    kil:    { name: 'Kil',    color: '#EF6C00', emoji: '🧱', icon: '🧱' },
    maden:  { name: 'Maden',  color: '#455A64', emoji: '⚙️', icon: '⚙️' },
};

// ==================== BİYOMLAR ====================
const BIOME_INFO = {
    ova:      { name: 'Ova',      fixedRes: ['besin', 'kil'],  color: '#8BC34A', dark: '#558B2F', emoji: '🌿', canSettle: true  },
    koruluk:  { name: 'Koruluk',  fixedRes: ['besin', 'odun'], color: '#388E3C', dark: '#1B5E20', emoji: '🌲', canSettle: true  },
    daglik:   { name: 'Dağlık',   fixedRes: ['tas', 'maden'],  color: '#8D6E63', dark: '#4E342E', emoji: '⛰️', canSettle: true  },
    cayir:    { name: 'Çayır',    fixedRes: ['besin', 'odun'], color: '#AED581', dark: '#689F38', emoji: '🌱', canSettle: true  },
    kumsal:   { name: 'Kumsal',   fixedRes: ['tas', 'kil'],    color: '#FFD54F', dark: '#F9A825', emoji: '🏖️', canSettle: true  },
    vaha:     { name: 'Vaha',     fixedRes: ['besin', 'maden'],color: '#26C6DA', dark: '#00838F', emoji: '🌴', canSettle: true  },
    col:      { name: 'Çöl',      fixedRes: [],                color: '#FFA726', dark: '#E65100', emoji: '🏜️', canSettle: false },
    bataklik: { name: 'Bataklık', fixedRes: [],                color: '#546E7A', dark: '#263238', emoji: '🌫️', canSettle: false },
};

const PRODUCTION_BIOMES = ['ova', 'koruluk', 'daglik', 'cayir', 'kumsal', 'vaha'];

// ==================== İNŞAAT MALİYETLERİ ====================
const BUILD_COSTS = {
    yol:          { odun: 1, tas: 2 },
    koy:          { besin: 1, odun: 1, kil: 1, tas: 1 },
    ciftlik:      { besin: 7, odun: 1, kil: 1 },
    kisla:        { maden: 5, tas: 2, odun: 2 },
    kervansaray:  { odun: 4, kil: 3, tas: 2 },
    tapinak:      { tas: 5, odun: 2, kil: 2 },
    muhendishane: { maden: 5, tas: 2, kil: 2 },
    tiyatro:      { besin: 3, kil: 3, odun: 3 },
};

const BUILDING_NAMES = {
    ciftlik:      'Çiftlik',
    kisla:        'Kışla',
    kervansaray:  'Kervansaray',
    tapinak:      'Tapınak',
    muhendishane: 'Mühendishane',
    tiyatro:      'Tiyatro',
};

const ALL_BUILDINGS = ['ciftlik', 'kisla', 'kervansaray', 'tapinak', 'muhendishane', 'tiyatro'];

// ==================== ASKERİ BİRİMLER ====================
const UNIT_DATA = {
    mizrakci:     { name: 'Mızrakçı',    cls: 'piyade',  gold: 2, duel: 0,  range: 0, speed: 0, siege: 0, special: 'anti_cavalry', emoji: '🗡️'  },
    kilicli:      { name: 'Kılıçlı',     cls: 'piyade',  gold: 2, duel: 0,  range: 0, speed: 0, siege: 0, special: 'anti_infantry', emoji: '⚔️'  },
    okcu:         { name: 'Okçu',         cls: 'piyade',  gold: 2, duel: -1, range: 1, speed: 0, siege: 0, special: null,            emoji: '🏹'  },
    sovalye:      { name: 'Şövalye',      cls: 'suvari',  gold: 4, duel: 2,  range: 0, speed: 0, siege: 0, special: null,            emoji: '🐴'  },
    hafif_suvari: { name: 'Hafif Süvari', cls: 'suvari',  gold: 3, duel: 0,  range: 0, speed: 1, siege: 0, special: null,            emoji: '🏇'  },
    atli_okcu:    { name: 'Atlı Okçu',    cls: 'suvari',  gold: 3, duel: -1, range: 1, speed: 1, siege: 0, special: null,            emoji: '🎯'  },
    kocbasi:      { name: 'Koçbaşı',      cls: 'kusatma', gold: 3, duel: -3, range: 0, speed: 0, siege: 1, special: 'no_attack',     emoji: '🐏'  },
    mancinik:     { name: 'Mancınık',     cls: 'kusatma', gold: 4, duel: -3, range: 1, speed: 0, siege: 1, special: null,            emoji: '💥'  },
    topcu:        { name: 'Topçu',        cls: 'kusatma', gold: 5, duel: -2, range: 0, speed: 0, siege: 1, special: 'multi_2',       emoji: '💣'  },
};

const UNIT_CLASSES = {
    piyade:  { name: 'Piyade',  emoji: '👤' },
    suvari:  { name: 'Süvari',  emoji: '🐎' },
    kusatma: { name: 'Kuşatma', emoji: '🏰' },
};

// ==================== OYUNCU RENKLERİ ====================
const PLAYER_COLORS = [
    { id: 'red',    name: 'Kırmızı', hex: '#FF1744', light: '#FFCDD2', dark: '#B71C1C' }, // Daha parlak/neon
    { id: 'blue',   name: 'Mavi',    hex: '#00B0FF', light: '#BBDEFB', dark: '#0D47A1' }, // Daha parlak neon mavi
    { id: 'green',  name: 'Yeşil',   hex: '#00E676', light: '#C8E6C9', dark: '#1B5E20' },
    { id: 'yellow', name: 'Sarı',    hex: '#FFEA00', light: '#FFF9C4', dark: '#F57F17' },
    { id: 'purple', name: 'Mor',     hex: '#D500F9', light: '#E1BEE7', dark: '#4A148C' },
    { id: 'teal',   name: 'Teal',    hex: '#1DE9B6', light: '#B2DFDB', dark: '#004D40' },
];

// ==================== HARİTA BOYUTLARI ====================
const MAP_SIZES = {
    orta:  { radius: 3, name: 'Orta (37 Hex)',   hexSize: 56 },
    buyuk: { radius: 4, name: 'Büyük (61 Hex)',  hexSize: 44 },
};

// ==================== OYUN SABİTLERİ ====================
const MAX_POPULATION = 16;
const SIEGE_NORMAL = 3;
const SIEGE_DESERT = 5;
const VP_GOAL = 10;
const MAX_TURNS = 100;
const GAME_END_CITIES = 6; // player needs 6 city-level settlements
const BANK_TRADE_RATE = 6; // 6 basic resources = 1 gold
const BANK_SELL_RATE  = 2; // 1 gold → 2 basic resources
const KERVANSARAY_LV2_RATE = 3; // with kervansaray lv2: 1 gold → 3 basic resources

const SIEGE_REQ = {
    Koy: 3,
    Sehir: 5,
    Metropol: 8
};

// ==================== ZAFER PUANLARI ====================
const VP = {
    koy:      1,
    sehir:    2,
    metropol: 3,
    bitirenOyuncu: 3,
    ciftlikLv3First: 3,
};

// ==================== YAPI BONUSLARI (açıklama) ====================
const BUILDING_BONUSES = {
    ciftlik: {
        1: ['Üretim zarı bu yerleşime denk gelirse +1 Besin (biyomdan bağımsız)'],
        2: ['(A) Her tur +1 Besin', '(B) Çiftlik inşa maliyeti -1'],
        3: ['(A) Asker popülasyonu +2', '(B) Bu yerleşim için kuşatma puanı +1'],
    },
    kervansaray: {
        1: ['Yol maliyet -1 (kaynak seçimli)'],
        2: ['(A) 1 Altın → 3 Temel Kaynak', '(B) Yolundan geçen rakip oyuncudan 1 kaynak al'],
        3: ['(A) Her tur kasadan 1 kaynak', '(B) Başkası ticaret yapınca 1 kaynak al'],
    },
    muhendishane: {
        1: ['Kuşatma birimleri üretilebilir'],
        2: ['(A) Topçu menzil +1', '(B) Hex kaynaklarını değiştirebilirsin'],
        3: ['(A) Mühendishane hex kuşatma puanı +1', '(B) Kuşatmada mancınık/topçu yok edilemez'],
    },
    tiyatro: {
        1: ['Bu şehirdeki diğer yapı maliyeti -1'],
        2: ['(A) 5 tur kuşatmaya dayanılırsa 1 düşman asker taraf değiştirir', '(B) Her ticarette kasadan +1 kaynak'],
        3: ['(A) Kuşatma puanı -1 azalır', '(B) Kazanılan düello: düşman ölmek yerine taraf değiştirir'],
    },
    kisla: {
        1: ['Mızrakçı, Kılıçlı ve Okçu düello zarı +1'],
        2: ['(A) Hafif Süvari ve Atlı Okçu patikada +1 hız', '(B) Şövalye düello zarı +1'],
        3: ['(A) Ölen birimleri -1 altınla dirilit', '(B) Turda bir kez yeniden zar at'],
    },
    tapinak: {
        1: ['Kuşatma altındaki yerleşim askerleri düello +1'],
        2: ['(A) Rakip kuşatma zarı -1', '(B) Berabere kalsan da düelloyu kazanmış sayılırsın'],
        3: ['(A) Şövalye altın maliyeti -1', '(B) Ölen 1 birimi tapınaklı yerleşimde bedelsiz dirilit'],
    },
};
