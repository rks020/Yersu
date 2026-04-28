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
    ova:      { name: 'Ova',      fixedRes: ['besin', 'kil'],  resName: 'Besin & Kil',   color: '#8BC34A', dark: '#558B2F', emoji: '🌿', canSettle: true  },
    koruluk:  { name: 'Koruluk',  fixedRes: ['besin', 'odun'], resName: 'Besin & Odun',  color: '#388E3C', dark: '#1B5E20', emoji: '🌲', canSettle: true  },
    daglik:   { name: 'Dağlık',   fixedRes: ['tas', 'maden'],  resName: 'Taş & Maden',   color: '#8D6E63', dark: '#4E342E', emoji: '⛰️', canSettle: true  },
    cayir:    { name: 'Çayır',    fixedRes: ['besin', 'odun'], resName: 'Besin & Odun',  color: '#AED581', dark: '#689F38', emoji: '🌱', canSettle: true  },
    kumsal:   { name: 'Kumsal',   fixedRes: ['tas', 'kil'],    resName: 'Taş & Kil',    color: '#FFD54F', dark: '#F9A825', emoji: '🏖️', canSettle: true  },
    vaha:     { name: 'Vaha',     fixedRes: ['besin', 'maden'],resName: 'Besin & Maden', color: '#26C6DA', dark: '#00838F', emoji: '🌴', canSettle: true  },
    col:      { name: 'Çöl',      fixedRes: [],                resName: 'Yok',           color: '#FFA726', dark: '#E65100', emoji: '🏜️', canSettle: false },
    bataklik: { name: 'Bataklık', fixedRes: [],                resName: 'Yok',           color: '#546E7A', dark: '#263238', emoji: '🌫️', canSettle: false },
};

const PRODUCTION_BIOMES = ['ova', 'koruluk', 'daglik', 'cayir', 'kumsal', 'vaha'];

// ==================== İNŞAAT MALİYETLERİ ====================
const BUILD_COSTS = {
    yol:          { odun: 1, tas: 2 },
    koy:          { odun: 1, kil: 1, tas: 1, besin: 1 },
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

const BUILDING_ICONS = {
    ciftlik:      '🚜',
    kisla:        '⚔️',
    kervansaray:  '🐪',
    tapinak:      '🏛️',
    muhendishane: '⚙️',
    tiyatro:      '🎭',
};

const ALL_BUILDINGS = ['ciftlik', 'kisla', 'kervansaray', 'tapinak', 'muhendishane', 'tiyatro'];

// ==================== ASKERİ BİRİMLER ====================
const UNIT_DATA = {
    mizrakci:     { name: 'Mızrakçı',    cls: 'piyade',  gold: 2, duel: 0,  range: 0, speed: 1, siege: 0, special: 'anti_cavalry',  duelBonusVs: 'suvari', img: 'mızrakçı.png' },
    kilicli:      { name: 'Kılıçlı',     cls: 'piyade',  gold: 2, duel: 0,  range: 0, speed: 1, siege: 0, special: 'anti_infantry', duelBonusVs: 'piyade', img: 'kılıçlı.png' },
    okcu:         { name: 'Okçu',         cls: 'piyade',  gold: 2, duel: -1, range: 1, speed: 1, siege: 0, special: null,                                   img: 'okçu.png'    },
    sovalye:      { name: 'Şövalye',      cls: 'suvari',  gold: 4, duel: 2,  range: 0, speed: 2, siege: 0, special: null,                                   img: 'şovalye.png' },
    hafif_suvari: { name: 'Hafif Süvari', cls: 'suvari',  gold: 3, duel: 0,  range: 0, speed: 2, siege: 0, special: null,                                   img: 'hafifsüvari.png' },
    atli_okcu:    { name: 'Atlı Okçu',    cls: 'suvari',  gold: 3, duel: -1, range: 1, speed: 2, siege: 0, special: null,                                   img: 'atlıokçu.png' },
    kocbasi:      { name: 'Koçbaşı',      cls: 'kusatma', gold: 3, duel: -3, range: 0, speed: 1, siege: 1, special: 'no_attack',                            img: 'kocbasi.png' },
    mancinik:     { name: 'Mancınık',     cls: 'kusatma', gold: 4, duel: -3, range: 1, speed: 1, siege: 1, special: null,                                   img: 'mancınık.png' },
    topcu:        { name: 'Topçu',        cls: 'kusatma', gold: 5, duel: -2, range: 0, speed: 1, siege: 1, special: 'multi_2',                              img: 'topçu.png'    },
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
const GAME_END_CITIES = 5; // player needs 5 city-level settlements
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
    finisher: 3,
    ciftlikLv3First: 3,
    // Diğerleri dinamik hesaplanacak
};

// ==================== YAPI BONUSLARI (açıklama) ====================
const BUILDING_BONUSES = {
    ciftlik: {
        1: ['Üretim zarı sonucu bu yerleşim yerine denk geldiyse +1 besin kazanılır (Biyomda besin olmasına gerek yoktur)'],
        2: ['(A) Oyuncu her turunda 1 besin kazanır', '(B) Gelecek çiftlik inşaları için maliyet artık sadece 6 besindir'],
        3: ['(A) Asker popülasyonu +2 artar (Maks 16)', '(B) Çiftlik bulunan her yerleşim için kuşatma puanı +1 artar'],
    },
    kervansaray: {
        1: ['(A) Yol maliyetinde -1 Odun', '(B) Yol maliyetinde -1 Taş'],
        2: ['(A) Altın karşılığında artık kasadan 3 temel kaynak alınabilir', '(B) Oyuncu yolundan geçenlerden her seferinde 1 temel kaynak alır'],
        3: ['(A) Oyuncu her turunda kasadan kendi seçeceği bir temel kaynağı alır', '(B) Diğer oyuncular her ticaret yaptığında kasadan seçtiğin bir temel kaynak alırsın'],
    },
    muhendishane: {
        1: ['Oyuncu artık kuşatma birimleri üretebilir'],
        2: ['(A) Topçu birimi menzili +1 artar', '(B) Üretim zarı atmadan önce yerleşim kurduğu biyomlara atanan kaynağı değiştirebilir'],
        3: ['(A) Mühendishane bulunan her yerleşim için kuşatma puanı +1 artar', '(B) Kuşatma altındaki yerleşim yerindeki mancınık ve topçu rakip şehri ele geçirene kadar yok edilemez'],
    },
    tiyatro: {
        1: ['Tiyatro bulunan şehirlere yapılacak diğer yapılar için gerekli temel kaynak maliyeti -1 azalır (Oyuncu seçer)'],
        2: ['(A) Kuşatma altındaki şehir 5 tur dayanırsa rakip birimlerden biri taraf değiştirir', '(B) Diğer oyuncularla yapılan her ticaret için kasadan seçilen 1 temel kaynak kazanılır'],
        3: ['(A) Ele geçirilmek istenen yerleşim yeri için gereken kuşatma puanı -1 azalır', '(B) Savaşta turda bir kere düello kazanıldığında rakip asker birimi ölmek yerine taraf değiştirir'],
    },
    kisla: {
        1: ['(A) Mızrakçı Düello Zarına +1', '(B) Kılıçlı Düello Zarına +1', '(C) Okçu Düello Zarına +1'],
        2: ['(A) Hafif Süvari ve Atlı Okçu patikalarda +1 Hız alır', '(B) Şövalye Düello Zarına +1'],
        3: ['(A) Bir önceki turda ölen asker birimleri -1 altın maliyetiyle diriltilebilir', '(B) Turda bir defa düello sırasında oyuncu tekrar zar atabilir'],
    },
    tapinak: {
        1: ['Kuşatma altındaki yerleşim yerindeki askeri birimlerin düello zarlarına +1 eklenir'],
        2: ['(A) Tapınak bulunan yerleşimlerde rakip oyuncuların kuşatma zarları -1 düşer', '(B) Düello zarlarında berabere kalınsa dahi oyuncu kazanmış sayılır'],
        3: ['(A) Şövalye üretimi için gerekli altın maliyeti -1 azalır', '(B) Ölen bir askeri birim tapınak bulunan bir yerleşimde bedelsiz dirilir'],
    },
};
