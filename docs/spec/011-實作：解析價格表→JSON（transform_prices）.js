const fs = require('fs');

// === STEP 1: Parse markdown ===
const content = fs.readFileSync('E:\\proj\\shopee\\docs\\總店（mazz68）價格一覽表.md', 'utf8');
const lines = content.split(/\r?\n/);
const products = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^(逛逛賣場|查看全部|分類|篩選|價格|賣場評價|隔日到貨$|多件優惠$|新上架$|已售出|最低價格|優惠$|TOP$|rating-star|\d+\/\d+$|custom-overlay)/.test(line)) continue;
    if (/^[\d.]+$/.test(line) && i > 0 && lines[i-1].trim() === 'rating-star') continue;
    if (line === '$' && i + 1 < lines.length && /^\d+$/.test(lines[i+1].trim())) {
        const name = lines[i-1].trim();
        const price = parseInt(lines[i+1].trim().replace(/,/g,''), 10);
        if (name && name !== '$' && !/^(隔日到貨|多件優惠|新上架|已售出|rating-star|賣場評價|查看全部|逛逛賣場|分類|篩選|價格|優惠)$/.test(name) && !/^\d+\/\d+$/.test(name)) {
            products.push({ name, price_twd: price });
        }
    }
}
const seen = new Map();
const unique = [];
for (const p of products) {
    if (!seen.has(p.name)) { seen.set(p.name, true); unique.push(p); }
}
console.log('Parsed:', unique.length, 'products');

// === STEP 2: Emoji strip + tag generation ===
function stripEmoji(s) {
    return s.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '').trim();
}

function guessTags(name) {
    const tags = [];
    const kw = name.toLowerCase();
    if (/\bai\b/i.test(name)) tags.push('AI');
    if (/nsfw/i.test(kw)) tags.push('NSFW');
    if (/video|影片|短劇|動畫|anime|影音/i.test(kw) || /sora|wan.*2|ltx|hunyuanvideo|shortdrama|seedance|cinetine/i.test(kw)) tags.push('影片生成', 'Video');
    if (/image|photo|圖片|圖|img|flux|sd|stable.?diffusion|pony|kandinsky|ermie|pixwit|ideogram|glm/i.test(kw) && !/video|影片|影音/i.test(kw)) tags.push('圖片生成', 'Image');
    if (/audio|音頻|music|sound|audiocraft|stable.?audio|foley/i.test(kw)) tags.push('音頻生成', 'Audio');
    if (/face.?swap|換臉|facefusion|roop|deep.?live.?cam|darkbeast|facepoke/i.test(kw)) tags.push('換臉', 'FaceSwap');
    if (/voice.?changer|變聲/i.test(kw)) tags.push('變聲', 'VoiceChanger');
    if (/edit|移除|去背|修圖|修復|inpaint|remove|propainter|minimax.?remove|firered|ace.?step/i.test(kw)) tags.push('圖片編輯', 'ImageEdit');
    if (/tts|text.?to.?speech|語音合成|edge.?tts|gpt.?sovits|f5-tts|index.*tts|moss|ming.*omni|vo.*cpm|vpot/i.test(kw)) tags.push('語音合成', 'TTS');
    if (/translate|翻譯|libretranslate/i.test(kw)) tags.push('翻譯', 'Translate');
    if (/3d/i.test(kw)) tags.push('3D');
    if (/comfyui/i.test(kw)) tags.push('ComfyUI');
    if (/windows|win/i.test(kw)) tags.push('Windows');
    if (/app|手機|android|安卓/i.test(kw)) tags.push('APP', 'Mobile');
    if (/real.?time|即時|live/i.test(kw)) tags.push('即時', 'RealTime');
    if (/vton|換衣|virtual.?try.?on|fashn|idm.?vton/i.test(kw)) tags.push('虛擬換衣', 'VTON');
    if (/anime|動漫/i.test(kw)) tags.push('動漫', 'Anime');
    if (/prompt/i.test(kw)) tags.push('Prompt');
    if (/ocr/i.test(kw)) tags.push('OCR');
    if (/up.?scale|upscale|高清|放大|novasr/i.test(kw)) tags.push('高清放大', 'Upscale');
    if (/deepseek/i.test(kw)) tags.push('AI', 'LLM', 'DeepSeek');
    if (/rvc|sovits|soulx/i.test(kw)) tags.push('音頻生成', 'Audio', 'AI歌手');
    if (/live.?portrait|heygem|hey.?gem|aniportrait/i.test(kw)) tags.push('影片生成', 'Video', 'Avatar');
    if (/music|音樂|合併|merge|song/i.test(kw)) tags.push('音頻生成', 'Audio');
    if (/八字|紫微|斗數|六爻|梅花|易數|命理|占卜/i.test(kw)) tags.push('命理', 'FortuneTelling');
    if (/中醫|養生/i.test(kw)) tags.push('中醫', 'Wellness');
    if (/hrms|人力|人資/i.test(kw)) tags.push('HR', '管理');
    if (/鋼琴|piano|簡譜/i.test(kw)) tags.push('音樂', 'Music', '學習');
    if (/區域網路|共享|file.?share/i.test(kw)) tags.push('工具', 'Utility', 'Network');
    if (/部署|運行|ollama|模型部署/i.test(kw)) tags.push('AI', '本地部署', 'Tools');
    if (/網站.*桌面應用|網站.*app/i.test(kw)) tags.push('工具', 'Utility');
    if (/水龍頭|faucet/i.test(kw)) tags.push('居家', '硬體');
    if (/voice|語音|聲音|speech|speaker|nar|克隆|複製/i.test(kw)) tags.push('語音', 'Voice');
    if (/unise|增強|去噪|分離|denoise/i.test(kw)) tags.push('音頻處理', 'AudioEnhance');
    if (/辨識|asr|recognition/i.test(kw)) tags.push('語音辨識', 'ASR');
    if (/工具包|toolkit|整合包|all.?in.?one|aio/i.test(kw)) tags.push('整合包', 'AllInOne');
    return tags;
}

// === STEP 3: Tag translation maps ===
const tagMap = {
    "AI": { "en": "AI", "ms": "AI" },
    "NSFW": { "en": "NSFW", "ms": "NSFW" },
    "影片生成": { "en": "Video Generation", "ms": "Penjanaan Video" },
    "Video": { "en": "Video", "ms": "Video" },
    "圖片生成": { "en": "Image Generation", "ms": "Penjanaan Imej" },
    "Image": { "en": "Image", "ms": "Imej" },
    "音頻生成": { "en": "Audio Generation", "ms": "Penjanaan Audio" },
    "Audio": { "en": "Audio", "ms": "Audio" },
    "換臉": { "en": "Face Swap", "ms": "Tukar Wajah" },
    "FaceSwap": { "en": "FaceSwap", "ms": "Tukar Wajah" },
    "變聲": { "en": "Voice Changer", "ms": "Penukar Suara" },
    "VoiceChanger": { "en": "Voice Changer", "ms": "Penukar Suara" },
    "圖片編輯": { "en": "Image Editing", "ms": "Suntingan Imej" },
    "ImageEdit": { "en": "Image Edit", "ms": "Sunting Imej" },
    "語音合成": { "en": "Text to Speech", "ms": "Teks ke Suara" },
    "TTS": { "en": "TTS", "ms": "TTS" },
    "翻譯": { "en": "Translation", "ms": "Terjemahan" },
    "Translate": { "en": "Translate", "ms": "Terjemah" },
    "3D": { "en": "3D", "ms": "3D" },
    "ComfyUI": { "en": "ComfyUI", "ms": "ComfyUI" },
    "Windows": { "en": "Windows", "ms": "Windows" },
    "APP": { "en": "APP", "ms": "APP" },
    "Mobile": { "en": "Mobile", "ms": "Mudah Alih" },
    "即時": { "en": "Real-time", "ms": "Masa Nyata" },
    "RealTime": { "en": "Real-time", "ms": "Masa Nyata" },
    "虛擬換衣": { "en": "Virtual Try-On", "ms": "Cuba Virtual" },
    "VTON": { "en": "VTON", "ms": "VTON" },
    "動漫": { "en": "Anime", "ms": "Anime" },
    "Anime": { "en": "Anime", "ms": "Anime" },
    "Prompt": { "en": "Prompt", "ms": "Arahan" },
    "OCR": { "en": "OCR", "ms": "OCR" },
    "高清放大": { "en": "HD Upscale", "ms": "Pembesaran HD" },
    "Upscale": { "en": "Upscale", "ms": "Pembesaran" },
    "LLM": { "en": "LLM", "ms": "LLM" },
    "DeepSeek": { "en": "DeepSeek", "ms": "DeepSeek" },
    "AI歌手": { "en": "AI Singer", "ms": "Penyanyi AI" },
    "Avatar": { "en": "Avatar", "ms": "Avatar" },
    "命理": { "en": "Fortune Telling", "ms": "Ramalan" },
    "FortuneTelling": { "en": "Fortune Telling", "ms": "Ramalan" },
    "中醫": { "en": "Chinese Medicine", "ms": "Perubatan Cina" },
    "Wellness": { "en": "Wellness", "ms": "Kesihatan" },
    "HR": { "en": "HR", "ms": "HR" },
    "管理": { "en": "Management", "ms": "Pengurusan" },
    "音樂": { "en": "Music", "ms": "Muzik" },
    "學習": { "en": "Learning", "ms": "Pembelajaran" },
    "工具": { "en": "Utility", "ms": "Utiliti" },
    "Utility": { "en": "Utility", "ms": "Utiliti" },
    "Network": { "en": "Network", "ms": "Rangkaian" },
    "本地部署": { "en": "Local Deployment", "ms": "Pemasangan Tempatan" },
    "Tools": { "en": "Tools", "ms": "Alatan" },
    "居家": { "en": "Home", "ms": "Rumah" },
    "硬體": { "en": "Hardware", "ms": "Perkakasan" },
    "語音": { "en": "Voice", "ms": "Suara" },
    "Voice": { "en": "Voice", "ms": "Suara" },
    "音頻處理": { "en": "Audio Processing", "ms": "Pemprosesan Audio" },
    "AudioEnhance": { "en": "Audio Enhance", "ms": "Peningkatan Audio" },
    "語音辨識": { "en": "Speech Recognition", "ms": "Pengecaman Suara" },
    "ASR": { "en": "ASR", "ms": "ASR" },
    "整合包": { "en": "All-in-One Pack", "ms": "Pakej Serba Satu" },
    "AllInOne": { "en": "All-in-One", "ms": "Serba Satu" },
    "Music": { "en": "Music", "ms": "Muzik" }
};

function translateTags(tags) {
    const zh = [], en = [], ms = [];
    for (const t of tags) {
        const m = tagMap[t];
        if (m) {
            if (!zh.includes(t)) zh.push(t);
            if (!en.includes(m.en)) en.push(m.en);
            if (!ms.includes(m.ms)) ms.push(m.ms);
        } else {
            zh.push(t); en.push(t); ms.push(t);
        }
    }
    return { "zh-TW": zh, en, ms };
}

// === STEP 4: Product name phrase translation ===
const phraseEn = {
    '最強': 'Ultimate', '神器': 'Tool', '一鍵': 'One-Click', '支援': 'Supports',
    '全新': 'New', '整合包': 'All-in-One Pack', '本地': 'Local',
    '手機': 'Mobile', '線下': 'Offline', '線上': 'Online', '高質量': 'High Quality',
    '專業': 'Professional', '自動': 'Auto', '無限': 'Unlimited', '免費': 'Free',
    '開源': 'Open Source', '即時': 'Real-time', '高清': 'HD',
    '超精準': 'Ultra Precise', '穩如狗': 'Rock Solid', '一鍵運行': 'One-Click Run',
    '一句話': 'One Sentence', '輸入': 'Input', '產生': 'Generate',
    '克隆': 'Clone', '複製': 'Copy', '去除': 'Remove', '修復': 'Restore',
    '去背': 'Remove BG', '換衣': 'Change Clothes', '換臉': 'Face Swap',
    '變聲': 'Voice Change', '翻譯': 'Translate', '修圖': 'Photo Edit',
    '增強': 'Enhance', '去雜訊': 'Denoise', '分離': 'Separate', '提取': 'Extract',
    '一體化': 'All-in-One', '管理系統': 'Management System',
    '學習': 'Learn', '工具': 'Tool', '軟體': 'Software',
    '桌面': 'Desktop', '應用程式': 'Application',
    '教學': 'Tutorial', '課程': 'Course',
    '預測': 'Prediction', '占卜': 'Divination', '算命': 'Fortune Telling',
    '玄機': 'Mystery', '命運': 'Destiny', '人生': 'Life',
    '音樂': 'Music', '歌單': 'Playlist', '合併': 'Merge',
    '鋼琴': 'Piano', '簡譜': 'Numbered Notation',
    '水龍頭': 'Faucet', '戶外': 'Outdoor',
    '擁抱': 'Embrace', '新時代': 'New Era',
    '人氣': 'Popular', '隨機': 'Random',
    '輕鬆': 'Easy', '簡單': 'Simple',
    '服務': 'Service',
    '框架': 'Framework',
    '驅動': 'Driver', '引擎': 'Engine',
    '程式': 'Program', '腳本': 'Script',
    '推廣': 'Promotion', '體驗': 'Experience',
    '版本': 'Version', '更新': 'Update',
    '可試用': 'Try First', '先試用': 'Trial Available',
    '最新': 'Latest',
};

const phraseMs = {
    '最強': 'Terunggul', '神器': 'Alat', '一鍵': 'Satu Klik', '支援': 'Menyokong',
    '全新': 'Baru', '整合包': 'Pakej Serba Satu', '本地': 'Tempatan',
    '手機': 'Mudah Alih', '線下': 'Luar Talian', '線上': 'Dalam Talian',
    '高質量': 'Kualiti Tinggi', '專業': 'Profesional', '自動': 'Auto',
    '無限': 'Tanpa Had', '免費': 'Percuma', '開源': 'Sumber Terbuka',
    '即時': 'Masa Nyata', '高清': 'HD', '超精準': 'Ultra Tepat',
    '穩如狗': 'Kukuh', '一鍵運行': 'Jalankan Satu Klik',
    '一句話': 'Satu Ayat', '輸入': 'Masukan', '產生': 'Hasilkan',
    '克隆': 'Klon', '複製': 'Salin', '去除': 'Buang', '修復': 'Pulihkan',
    '去背': 'Buang Latar', '換衣': 'Tukar Pakaian', '換臉': 'Tukar Wajah',
    '變聲': 'Ubah Suara', '翻譯': 'Terjemah', '修圖': 'Sunting Foto',
    '增強': 'Tingkatkan', '去雜訊': 'Nyahbunyi', '分離': 'Asingkan',
    '提取': 'Ekstrak', '一體化': 'Serba Satu', '管理系統': 'Sistem Pengurusan',
    '學習': 'Belajar', '工具': 'Alat', '軟體': 'Perisian',
    '桌面': 'Desktop', '應用程式': 'Aplikasi',
    '教學': 'Tutorial', '課程': 'Kursus',
    '預測': 'Ramalan', '占卜': 'Ramalan', '算命': 'Ramalan Nasib',
    '玄機': 'Misteri', '命運': 'Nasib', '人生': 'Kehidupan',
    '音樂': 'Muzik', '歌單': 'Senarai Main', '合併': 'Gabung',
    '鋼琴': 'Piano', '簡譜': 'Notasi Nombor',
    '水龍頭': 'Pili Air', '戶外': 'Luar Rumah',
    '擁抱': 'Hayati', '新時代': 'Era Baru',
    '人氣': 'Popular', '隨機': 'Rawak',
    '輕鬆': 'Mudah', '簡單': 'Ringkas',
    '服務': 'Perkhidmatan',
    '框架': 'Rangka Kerja',
    '驅動': 'Pemandu', '引擎': 'Enjin',
    '程式': 'Program', '腳本': 'Skrip',
    '推廣': 'Promosi', '體驗': 'Pengalaman',
    '版本': 'Versi', '更新': 'Kemas Kini',
    '可試用': 'Cuba Dulu', '先試用': 'Percubaan',
    '最新': 'Terkini',
};

function translateName(name) {
    const cleaned = stripEmoji(name);
    let en = cleaned;
    let ms = cleaned;
    for (const [zhPhrase] of Object.entries(phraseEn)) {
        const re = new RegExp(zhPhrase, 'g');
        en = en.replace(re, phraseEn[zhPhrase]);
        ms = ms.replace(re, phraseMs[zhPhrase]);
    }
    en = en.replace(/ +/g, ' ').trim();
    ms = ms.replace(/ +/g, ' ').trim();
    return { "zh-TW": cleaned, en, ms };
}

// === BUILD RESULT ===
const result = unique.map(p => {
    const name = p.name;
    const nsfw = /nsfw/i.test(name);
    const tags = translateTags(guessTags(name));
    const names = translateName(name);
    return {
        product_name: names,
        price_twd: p.price_twd,
        nsfw,
        tag: tags
    };
});

fs.writeFileSync('E:\\proj\\shopee\\docs\\data\\product-catalog.json', JSON.stringify(result, null, 4), 'utf8');
console.log('Done:', result.length, 'products');
console.log('Empty tag count:', result.filter(p => p.tag['zh-TW'].length === 0).length);
console.log('\n=== SAMPLE ===');
console.log(JSON.stringify(result.slice(0, 3), null, 2));
