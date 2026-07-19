const fs = require('fs');
const current = JSON.parse(fs.readFileSync('E:\\proj\\shopee\\docs\\data\\product-catalog.json', 'utf8'));

const translations = [
// idx, en, ms
[0, 'Wan2.2-SVI2-Pro-remix - 2026 Ultimate NSFW Image-to-Video Tool', 'Wan2.2-SVI2-Pro-remix - Alat Imej-ke-Video NSFW 2026 Terunggul'],
[1, 'Android Mobile AI Face Swap Tool! NSFW One-Click Swap, Photo+Video at Will! APP (Trial Available)', 'Alat Tukar Wajah AI Android! NSFW Tukar Satu Klik, Foto+Video Sesuka Hati! APP (Percubaan)'],
[2, 'AI Auto-Generate Short Drama Explainers - One Sentence Input, Video Output', 'AI Jana Auto Video Penerangan Drama Pendek - Satu Ayat Input, Terus Hasil Video'],
[3, 'LTX-2 Sync Audio-Video! Open-Source Video Model, Redefining AI Video Creation with Precise Control', 'LTX-2 Segerak Audio-Video! Model Video Sumber Terbuka, Mentakrif Semula Penciptaan Video AI'],
[4, 'FireRed-Image-Edit - AI Image Editor Supports NSFW, Text Editing Rock-Solid, Old Photo Restoration, Virtual Try-On', 'FireRed-Image-Edit - Editor Imej AI Sokong NSFW, Suntingan Teks Kukuh, Pulihkan Foto Lama, Cuba Virtual'],
[5, 'The Most Comprehensive ComfyUI Workflow Course Online', 'Kursus Aliran Kerja ComfyUI Paling Lengkap Dalam Talian'],
[6, 'Qwen-Image-Edit-AIO - AI Photoshop, One-Click Image Editing, 10s Output, Supports NSFW S-Level', 'Qwen-Image-Edit-AIO - AI Photoshop, Sunting Imej Satu Klik, Output 10s, Sokong NSFW Tahap-S'],
[7, 'Anima V2: Anime AI Drawing Tool, Fast Character Illustration & Art Generation All-in-One Pack', 'Anima V2: Alat Lukisan AI Anime, Penjanaan Ilustrasi Watak & Seni Cepat Pakej Serba Satu'],
[8, 'UniSE: Multi-Task Audio Enhancement, One-Click Denoise, Separate & Extract', 'UniSE: Peningkatan Audio Pelbagai Tugas, Nyahbunyi Satu Klik, Asing & Ekstrak'],
[9, 'AI Black Tech - Simple & Easy Mosaic Removal Tool', 'AI Teknologi Hitam - Alat Buang Mosaik Mudah & Ringkas'],
[10, 'HeyGem AI Digital Human Clone 2026 - Lip-Sync, Avatar, Short Video & Audio Generation', 'HeyGem AI Klon Manusia Digital 2026 - Segerak Bibir, Avatar, Video Pendek & Penjanaan Audio'],
[11, 'Tianji Ziwei Doushu Professional Fortune-Telling Software', 'Perisian Ramalan Ziwei Doushu Profesional Tianji'],
[12, 'Flux.2-Klein-9B-EA - Perfect Transfer to New Scenes, Poses, Outfits, Lighting, Face/Body Swap', 'Flux.2-Klein-9B-EA - Pindah ke Adegan, Pose, Pakaian, Pencahayaan Baru, Tukar Wajah/Badan'],
[13, 'CineTTS-Studio Voice Clone AI Dubbing Kit - 8G VRAM, Emotion & Paralanguage Control', 'CineTTS-Studio Klon Suara Kit Alih Suara AI - 8G VRAM, Kawalan Emosi & Parabahasa'],
[14, 'AI Text-to-Video & Image-to-Video, Hunyuan Video V1.3, No Time Limit, Any Resolution', 'AI Teks-ke-Video & Imej-ke-Video, Hunyuan Video V1.3, Tiada Had Masa, Sebarang Resolusi'],
[15, 'ViiTorVoice-NAR - Clone Your Voice with One Sentence, Partial Edit & Emotion Control', 'ViiTorVoice-NAR - Klon Suara dengan Satu Ayat, Suntingan Separa & Kawalan Emosi'],
[16, 'VisoMaster Next-Gen AI Face Swap Tool - Video, Live & Photo Face Swap', 'VisoMaster Alat Tukar Wajah AI Generasi Baharu - Video, Langsung & Foto'],
[17, 'AI Generated NSFW Image Set - 9000 Images', 'Set Imej NSFW Jana AI - 9000 Imej'],
[18, 'AI Dream Factory - Price Difference Item Only', 'Kilang Impian AI - Item Perbezaan Harga Sahaja'],
[19, 'AI Photo Editing Tool + Portrait Retouch + Beauty Slim + Denoise + BG Change + Remove People', 'Alat Sunting Foto AI + Retret Potret + Cantik Kurus + Nyahbunyi + Tukar Latar + Buang Orang'],
[20, 'AI Prompt Smart Enhancer - Generate Consistent Text-to-Image Prompts', 'Peningkatan Pintar Arahan AI - Jana Arahan Teks-ke-Imej Konsisten'],
[21, 'AI Prompt Optimizer - One-Click Optimize Your Prompts', 'Pengoptimum Arahan AI - Optimumkan Arahan Satu Klik'],
[22, 'Ultimate Coding AI! Qwen3.6-Plus Tops Charts, Max Agent Capability! Anyone Can Code', 'AI Pengekodan Terunggul! Qwen3.6-Plus Cemerlang, Keupayaan Agen Maksimum!'],
[23, 'AI Voice Changer', 'Penukar Suara AI'],
[24, 'OpenCode - Open-Source AI Coding Agent, Out-of-Box, Remote Setup Included', 'OpenCode - Ejen Pengekodan AI Sumber Terbuka, Siap Diguna, Pemasangan Jarak Jauh'],
[25, "QwenPaw - One-Click Run LLM No API Key, Desktop AI Agent Assistant WIN Edition", 'QwenPaw - Jalankan LLM Satu Klik, Pembantu Ejen AI Desktop Edisi WIN'],
[26, 'GPT-SoVITS V4 Ultimate AI Voice Clone & Text-to-Speech Software', 'GPT-SoVITS V4 Perisian Klon Suara AI & Teks-ke-Suara Terunggul'],
[27, 'Roop_unleashed v8.0 Chinese Edition - Batch Face Swap, Live Face Swap, All-in-One Pack', 'Roop_unleashed v8.0 Edisi Cina - Tukar Wajah Pukal, Langsung, Pakej Serba Satu'],
[28, 'Sora Video Watermark Remover', 'Pembuang Tanda Air Video Sora'],
[29, '[Windows] AI Erase & Cutout Software - Photo Retouch', '[Windows] Perisian Padam & Potong AI - Retouch Foto'],
[30, 'AI One-Click Face Swap - Offline Edition, No Internet Required', 'AI Tukar Wajah Satu Klik - Edisi Luar Talian, Tiada Internet'],
[31, 'Android AI Face Editor APP', 'APP Editor Wajah AI Android'],
[32, 'Edge-TTS Microsoft TTS Desktop Tool (Text-to-Speech) - No Deployment, One-Click Start', 'Edge-TTS Alat TTS Microsoft Desktop - Tiada Pemasangan, Satu Klik Mula'],
[33, 'Audio_separator - Music Vocal/Instrument Separation Tool', 'Audio_separator - Alat Pengasingan Vokal/Alat Muzik'],
[34, 'AI Video Object Eraser - Moving or Fixed Objects, People, Watermarks, Subtitles', 'Pemadam Objek Video AI - Objek Bergerak/Tetap, Orang, Tanda Air, Sari Kata'],
[35, 'IMAGDressing - AI One-Click Virtual Try-On, Customizable Face & Pose All-in-One Pack', 'IMAGDressing - AI Cuba Virtual, Muka & Pose Boleh Ubah Pakej Serba Satu'],
[36, 'Mobile AI Voice Changer Pro Android Edition', 'Penukar Suara AI Mudah Alih Edisi Android Pro'],
[37, 'Out-of-Box Comprehensive AI - Code, Chat, Writing, Translation, Music, Training', 'Perisian AI Komprehensif - Jana Kod, Sembang, Penulisan, Terjemahan, Muzik, Latihan'],
[38, 'PRL Pearl Coin AI Computing Mining Program', 'PRL Syiling Mutiara Program Perlombongan Komputer AI'],
[39, 'AI Cover Song Maker - Let AI Sing Your Next Million-View Hit', 'Pembuat Lagu Cover AI - AI Nyanyikan Hits Juta-Tontonan Anda'],
[40, 'DeepSeek Local Deployment - One-Click Run, Unzip & Use, 4G VRAM, 99% Models', 'DeepSeek Pemasangan Tempatan - Jalankan Satu Klik, 4G VRAM, 99% Model'],
[41, 'Local AI Drawing Tool! Stable Diffusion Chinese Edition, One-Click Unleash Creativity!', 'Alat Lukisan AI Tempatan! Stable Diffusion Edisi Cina, Satu Klik Bebaskan Kreativiti!'],
[42, 'Omni Voice - 600+ Languages Voice Clone, Subtitle-to-Speech, Ultra-Fast Natural Dubbing', 'Omni Voice - Klon Suara 600+ Bahasa, Sari Kata-ke-Suara, Alih Suara Semula Jadi'],
[43, 'Stable Video Infinity 2.0Pro - Infinite Stable Video Generation ComfyUI Workflow', 'Stable Video Infinity 2.0Pro - Penjanaan Video Stabil Aliran Kerja ComfyUI'],
[44, 'RVC - High-Quality Voice Clone, AI Voice Changer, Live Voice Change, AI Singing', 'RVC - Klon Suara, Penukar Suara AI, Ubah Suara Langsung, Nyanyian AI'],
[45, 'Use Your Phone as a PC Webcam', 'Guna Telefon Anda sebagai Webcam PC'],
[46, 'CLIP Interrogator - AI Image Analysis for Perfect Prompts + Voice Translation', 'CLIP Interrogator - Analisis Imej AI untuk Arahan Sempurna + Terjemahan Suara'],
[47, '1800 AI Drawing Prompt Library', '1800 Perpustakaan Arahan Lukisan AI'],
[48, 'Solong Video Format Converter', 'Penukar Format Video Solong'],
[49, 'DramaBox Local AI Dubbing Studio', 'Studio Alih Suara AI Tempatan DramaBox'],
];

// Verify length
console.log('Translation batch 1:', translations.length);

// Write the file in Node.js format for next step
fs.writeFileSync('E:\\proj\\shopee\\docs\\tr_batch1.json', JSON.stringify(translations), 'utf8');
console.log('Written');
