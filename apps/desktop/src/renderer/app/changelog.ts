// "What's new" shown once after an update. Newest first. Keep each line short and about what people notice.
export interface Release { version: string; date: string; en: string[]; ar: string[] }

export const CHANGELOG: Release[] = [
  {
    version: '1.2.0',
    date: '2026-11-26',
    en: [
      'Your voice is clearer: mono processing (no more one-ear audio), no dropouts on loud moments or long vowels',
      'New noise suppression levels: Standard, AI and Max, plus a Studio (raw) input profile',
      'Mic and headphone menus on the arrows: device, input profile, volume and a live level meter',
      'Right-click menus everywhere: people, voice tiles, channels, categories and servers',
      'Moderators can server-mute, server-deafen, move and disconnect people in voice',
      'Discord-style call screen: bigger tiles with your picture, fullscreen and pop-out for streams',
      'New Go Live picker: Applications / Entire Screen, stream modes, resolution and frame rate (starts at 1080p 30)',
      '"Playing …": friends see what game you play and for how long (Settings → Activity Privacy)',
      'Free profile cosmetics: avatar decorations, profile effects, name styles and nameplates',
      'Crop and zoom your avatar and banner before saving, animated GIFs included',
      'Every emoji, with search',
      'Profile pictures and names update for everyone instantly',
      'Quieter, balanced app sounds with a volume slider; new call sounds',
      'Faster joining and leaving voice; double clicks no longer double the sound',
      'Help (?) opens mnlovo on Telegram',
    ],
    ar: [
      'صوتك أوضح: معالجة أحادية (ما عاد الصوت يطلع من أذن وحدة)، وما يختفي الصوت العالي أو المد الطويل',
      'مستويات جديدة لعزل الضوضاء: عادي، ذكاء اصطناعي، وأقصى عزل، مع ملف «استوديو» للمايك الخام',
      'قوائم المايك والسماعة من السهم: الجهاز، ملف الإدخال، مستوى الصوت ومؤشر حي',
      'قوائم كليك يمين في كل مكان: الأشخاص، مربعات المكالمة، الرومات، الأقسام والسيرفرات',
      'المشرفين يقدرون يكتمون ويطرشون وينقلون ويطردون من الروم الصوتي',
      'شاشة مكالمة مثل دسكورد: مربعات أكبر بصورتك، وملء الشاشة ونافذة منبثقة للبث',
      'اختيار بث جديد: التطبيقات / الشاشة كاملة، أوضاع البث، الدقة والفريمات (يبدأ 1080p 30)',
      '«يلعب …»: أصحابك يشوفون شو تلعب ومن متى (الإعدادات ← خصوصية النشاط)',
      'زينة مجانية للبروفايل: إطارات للصورة، تأثيرات، ستايل للاسم وخلفية للاسم',
      'قص وتكبير الصورة والبنر قبل الحفظ، والـ GIF المتحرك يشتغل',
      'كل الإيموجيات مع البحث',
      'الصور والأسماء تتحدث عند الكل فوراً',
      'أصوات التطبيق أهدى ومتوازنة مع شريط للتحكم، وأصوات اتصال جديدة',
      'دخول وطلعة الروم أسرع، والضغط مرتين ما يكرر الصوت',
      'زر المساعدة (؟) يفتح حساب mnlovo في تلجرام',
    ],
  },
];
