// v1.2 strings (merged into the main dictionaries in i18n.ts). Written fresh for mncord.
type Dict = { [k: string]: string | Dict };

export const EN_EXTRA: Dict = {
  common: { delete: 'Delete' },
  gate: { welcome: 'Welcome to mncord' },
  status: { dndSub: 'You won’t get desktop notifications', invisibleSub: 'You’ll look offline, but can still use mncord' },
  voice: { inviteToVoice: 'Invite to Voice', more: 'More options', ping: 'Ping: {{ms}} ms' },
  vs: {
    loudProtect: 'Keep loud moments clear',
    loudProtectSub: 'Rounds off peaks (laughing, shouting) before noise suppression, so your voice never cuts out or turns robotic when it gets loud.',
    gate: 'Noise gate',
    gateSub: 'Silences the mic below your sensitivity. Turn it off if the end of long words gets cut.',
  },
  profileEdit: { gifNote: 'You can crop and zoom before saving. Animated GIFs stay animated.', unsaved: 'Careful, you have unsaved changes!' },
  settings: {
    search: 'Search', editProfiles: 'Edit profiles', editProfile: 'Edit user profile', notifications: 'Notifications',
    activityGroup: 'Activity settings', activityPrivacy: 'Activity privacy', games: 'Registered games',
    accountInfo: 'Account info', passwordSecurity: 'Password & security', accountStatus: 'Account status', password: 'Password',
    enabled: 'Enabled', disabled: 'Off', devicesCount_one: '{{count}} device', devicesCount_other: '{{count}} devices',
    reveal: 'Reveal', hide: 'Hide', standing: 'Account standing', standingSub: 'Thanks for keeping mncord friendly. Any problem with your account would show here.', allGood: 'All good',
    volumes: 'Volume',
    sup: {
      off: 'Off', offSub: 'No noise suppression.',
      rnnoise: 'Standard', rnnoiseSub: 'Removes steady background noise (fans, AC, keyboard hum). Natural voice, very light on the PC. Recommended.',
      gtcrn: 'AI', gtcrnSub: 'Stronger AI suppression for louder rooms. Uses more CPU.',
      max: 'Max (aggressive)', maxSub: 'Both suppressors together. Strongest, for very noisy places.',
      maxWarnTitle: 'Know what you’re switching on',
      maxWarn: 'Max suppression can make your voice thin or robotic and may swallow quiet words or long vowels. Use it only when there is a lot of noise around you, and switch back to Standard afterwards.',
    },
  },
  am: {
    inputOptions: 'Input options', outputOptions: 'Output options', inputDevice: 'Input device', outputDevice: 'Output device', inputProfile: 'Input profile',
    inputVolume: 'Input volume', outputVolume: 'Output volume', inputLevel: 'Input level', voiceSettings: 'Voice settings', windowsDefault: 'Windows default',
    profile: {
      isolation: 'Voice isolation', isolationSub: 'Noise suppression on, everything tuned for you',
      studio: 'Studio', studioSub: 'Raw mic, no processing at all (good mic + headphones)',
      custom: 'Custom', customSub: 'Your own advanced settings',
    },
  },
  um: {
    profile: 'Profile', message: 'Message', editProfile: 'Edit profile', localMute: 'Mute', serverMute: 'Server mute', serverDeafen: 'Server deafen',
    moveTo: 'Move to', disconnect: 'Disconnect', copyId: 'Copy user ID', copied: 'Copied!', showNonVideo: 'Show non-video participants', showOwnCamera: 'Show my own camera',
  },
  ctx: {
    copyServerId: 'Copy server ID', copyChannelId: 'Copy channel ID', copyCategoryId: 'Copy category ID', copyLink: 'Copy link', hideMuted: 'Hide muted channels',
    joinVoice: 'Join voice', inviteVoice: 'Invite to voice', editChannel: 'Edit channel', duplicate: 'Duplicate channel', createText: 'Create text channel', createVoice: 'Create voice channel',
    deleteChannel: 'Delete channel', deleteCategory: 'Delete category', deleteConfirm: 'Delete “{{name}}”? This can’t be undone.',
    collapseCategory: 'Collapse category', collapseAll: 'Collapse all categories', muteCategory: 'Mute category', editCategory: 'Edit category',
  },
  live: {
    apps: 'Applications', entireScreen: 'Entire screen', shareScreen: 'Share screen', noSources: 'Nothing to share here yet.', streamMode: 'Stream mode',
    mode: { gaming: 'Gaming', gamingSub: 'Smoother video (1440p, 60 fps)', screenshare: 'Screenshare', screenshareSub: 'Clearer text (1080p, 15 fps)', custom: 'Custom' },
    resolution: 'Screen resolution', frameRate: 'Frame rate', muteAudio: 'Mute stream audio', audioMuted: 'audio muted', popOut: 'Pop out',
  },
  sounds: {
    title: 'App sounds', volume: 'Sound volume', volumeSub: 'Joining, leaving, muting, messages, calls and the rest.', preview: 'Play',
    n: { join: 'Join voice', leave: 'Leave voice', mute: 'Mute', unmute: 'Unmute', deafen: 'Deafen', undeafen: 'Undeafen', message: 'Message', mention: 'Mention', ring_in: 'Incoming call', ring_out: 'Outgoing call', call_end: 'Call ended', stream_start: 'Stream started', stream_stop: 'Stream ended', ptt_on: 'Push to talk on', ptt_off: 'Push to talk off', disconnect: 'Disconnected', reconnect: 'Reconnected' },
  },
  activity: {
    playing: 'Playing {{name}}', playingTitle: 'Playing a game', justNow: 'Just started', minutes_one: 'for {{count}} minute', minutes_other: 'for {{count}} minutes', hours: 'for {{h}}h {{m}}m',
    share: 'Share my activity', shareSub: 'Show friends and server members which game you’re playing and for how long.',
    privacyNote: 'mncord only looks at the names of running programs on your PC to recognise games. Nothing else is read, and only the game name is shared.',
  },
  games: {
    none: 'No game detected', noneSub: 'Start a game and it shows up here.', playingNow: 'Playing now, your friends can see it', hide: 'Not a game',
    add: 'Add it!', addSub: 'Is a game missing? Pick it from your running programs and give it a name.', program: 'Running program', name: 'Game name', addBtn: 'Add game',
    yours: 'Games you added', hidden: 'Hidden (click to show again)', knownCount: 'mncord recognises {{count}} popular games out of the box.',
  },
  cos: {
    title: 'Profile cosmetics, free for everyone', sub: 'Make your profile yours. Everyone sees these on your profile, in calls and in member lists.', none: 'None', inList: 'In member lists',
    decoration: { _: 'Avatar decoration', glow: 'Glow', rainbow: 'Rainbow', gold: 'Gold', neon: 'Neon', fire: 'Fire', frost: 'Frost', galaxy: 'Galaxy' },
    effect: { _: 'Profile effect', sparkles: 'Sparkles', snow: 'Snow', hearts: 'Hearts', embers: 'Embers', aurora: 'Aurora', stars: 'Stars' },
    nameStyle: { _: 'Display name style', aurora: 'Aurora', sunset: 'Sunset', gold: 'Gold', neon: 'Neon', ocean: 'Ocean', candy: 'Candy', chrome: 'Chrome' },
    nameplate: { _: 'Nameplate', aurora: 'Aurora', sunset: 'Sunset', ocean: 'Ocean', ember: 'Ember', galaxy: 'Galaxy', forest: 'Forest' },
  },
  layout: { rail: 'Show / hide servers', sidebar: 'Show / hide channels', members: 'Show / hide members' },
  gs: { discoverable: 'Findable by name', discoverableSub: 'People can type the server name in “Join a server” and join without an invite.' },
  crop: { title: 'Edit image', apply: 'Apply', zoom: 'Zoom', working: 'Saving…', hint: 'Drag to move · scroll or use the slider to zoom' },
  update: {
    downloading: 'Downloading an update', readyTitle: 'Update ready', readyShort: 'Restart to update', whatsNew: 'What’s new', later: 'Later', gotIt: 'Nice!',
    background: 'It downloads in the background. Keep chatting.',
  },
};

export const AR_EXTRA: Dict = {
  common: { delete: 'حذف' },
  gate: { welcome: 'أهلاً بك في mncord' },
  status: { dndSub: 'لن تصلك إشعارات سطح المكتب', invisibleSub: 'ستظهر غير متصل، لكن تقدر تستخدم mncord عادي' },
  voice: { inviteToVoice: 'دعوة للروم الصوتي', more: 'خيارات أكثر', ping: 'البنق: {{ms}} ms' },
  vs: {
    loudProtect: 'حافظ على وضوح الصوت العالي',
    loudProtectSub: 'يهذّب الذروات (الضحك والصراخ) قبل عزل الضوضاء، فما يختفي صوتك ولا يصير آلياً لما يعلى.',
    gate: 'بوابة الضوضاء',
    gateSub: 'تكتم المايك تحت مستوى الحساسية. طفّها إذا آخر الكلمات الطويلة ينقطع.',
  },
  profileEdit: { gifNote: 'تقدر تقص وتكبّر الصورة قبل الحفظ. صور GIF تبقى متحركة.', unsaved: 'انتبه، عندك تغييرات ما انحفظت!' },
  settings: {
    search: 'بحث', editProfiles: 'تعديل الملف الشخصي', editProfile: 'تعديل ملفك', notifications: 'الإشعارات',
    activityGroup: 'إعدادات النشاط', activityPrivacy: 'خصوصية النشاط', games: 'الألعاب المسجلة',
    accountInfo: 'معلومات الحساب', passwordSecurity: 'كلمة المرور والأمان', accountStatus: 'حالة الحساب', password: 'كلمة المرور',
    enabled: 'مفعّل', disabled: 'غير مفعّل', devicesCount_one: 'جهاز واحد', devicesCount_other: '{{count}} أجهزة',
    reveal: 'إظهار', hide: 'إخفاء', standing: 'وضع الحساب', standingSub: 'شكراً لأنك تخلي mncord مكان لطيف. أي مشكلة في حسابك تطلع هنا.', allGood: 'كل شي تمام',
    volumes: 'مستوى الصوت',
    sup: {
      off: 'بدون', offSub: 'بدون عزل للضوضاء.',
      rnnoise: 'عادي', rnnoiseSub: 'يشيل الضوضاء الثابتة (المروحة، المكيف، طنين الكيبورد). صوت طبيعي وخفيف على الجهاز. ننصح فيه.',
      gtcrn: 'ذكاء اصطناعي', gtcrnSub: 'عزل أقوى بالذكاء الاصطناعي للأماكن الصاخبة. يستهلك معالج أكثر.',
      max: 'أقصى عزل (قوي جداً)', maxSub: 'العازلين مع بعض. الأقوى، للأماكن الصاخبة جداً.',
      maxWarnTitle: 'انتبه قبل ما تشغّله',
      maxWarn: 'أقصى عزل ممكن يخلي صوتك رفيع أو آلي، وممكن يبلع الكلام الخفيف أو المد الطويل. استخدمه بس إذا حولك إزعاج كثير، وارجع لـ«عادي» بعدها.',
    },
  },
  am: {
    inputOptions: 'خيارات الإدخال', outputOptions: 'خيارات الإخراج', inputDevice: 'جهاز الإدخال', outputDevice: 'جهاز الإخراج', inputProfile: 'ملف الإدخال',
    inputVolume: 'مستوى الإدخال', outputVolume: 'مستوى الإخراج', inputLevel: 'مستوى الصوت الحالي', voiceSettings: 'إعدادات الصوت', windowsDefault: 'افتراضي ويندوز',
    profile: {
      isolation: 'عزل الصوت', isolationSub: 'عزل الضوضاء شغال، وكل شي مضبوط لك',
      studio: 'استوديو', studioSub: 'مايك خام بدون أي معالجة (مايك زين + سماعات)',
      custom: 'مخصص', customSub: 'إعداداتك المتقدمة الخاصة',
    },
  },
  um: {
    profile: 'الملف الشخصي', message: 'مراسلة', editProfile: 'تعديل الملف', localMute: 'كتم', serverMute: 'كتم من السيرفر', serverDeafen: 'تطريش من السيرفر',
    moveTo: 'نقل إلى', disconnect: 'فصل من الروم', copyId: 'نسخ معرّف المستخدم', copied: 'تم النسخ!', showNonVideo: 'إظهار اللي بدون كاميرا', showOwnCamera: 'إظهار كاميرتي',
  },
  ctx: {
    copyServerId: 'نسخ معرّف السيرفر', copyChannelId: 'نسخ معرّف الروم', copyCategoryId: 'نسخ معرّف القسم', copyLink: 'نسخ الرابط', hideMuted: 'إخفاء الرومات المكتومة',
    joinVoice: 'دخول الروم', inviteVoice: 'دعوة للروم الصوتي', editChannel: 'تعديل الروم', duplicate: 'تكرار الروم', createText: 'إنشاء روم كتابي', createVoice: 'إنشاء روم صوتي',
    deleteChannel: 'حذف الروم', deleteCategory: 'حذف القسم', deleteConfirm: 'حذف «{{name}}»؟ ما تقدر ترجعه.',
    collapseCategory: 'طي القسم', collapseAll: 'طي كل الأقسام', muteCategory: 'كتم القسم', editCategory: 'تعديل القسم',
  },
  live: {
    apps: 'التطبيقات', entireScreen: 'الشاشة كاملة', shareScreen: 'مشاركة الشاشة', noSources: 'ما في شي للمشاركة هنا.', streamMode: 'وضع البث',
    mode: { gaming: 'ألعاب', gamingSub: 'فيديو أنعم (1440p، 60 فريم)', screenshare: 'مشاركة شاشة', screenshareSub: 'نص أوضح (1080p، 15 فريم)', custom: 'مخصص' },
    resolution: 'دقة الشاشة', frameRate: 'الفريمات', muteAudio: 'كتم صوت البث', audioMuted: 'الصوت مكتوم', popOut: 'نافذة منبثقة',
  },
  sounds: {
    title: 'أصوات التطبيق', volume: 'مستوى الأصوات', volumeSub: 'الدخول، الطلعة، الكتم، الرسائل، الاتصالات وغيرها.', preview: 'تشغيل',
    n: { join: 'دخول الروم', leave: 'طلعة الروم', mute: 'كتم', unmute: 'إلغاء الكتم', deafen: 'تطريش', undeafen: 'إلغاء التطريش', message: 'رسالة', mention: 'منشن', ring_in: 'اتصال وارد', ring_out: 'اتصال صادر', call_end: 'انتهاء المكالمة', stream_start: 'بدء البث', stream_stop: 'انتهاء البث', ptt_on: 'اضغط للتحدث (تشغيل)', ptt_off: 'اضغط للتحدث (إيقاف)', disconnect: 'انقطع الاتصال', reconnect: 'رجع الاتصال' },
  },
  activity: {
    playing: 'يلعب {{name}}', playingTitle: 'يلعب لعبة', justNow: 'بدأ للتو', minutes_one: 'من دقيقة', minutes_other: 'من {{count}} دقيقة', hours: 'من {{h}} س {{m}} د',
    share: 'مشاركة نشاطي', shareSub: 'يشوف أصحابك وأعضاء السيرفرات شو تلعب ومن متى.',
    privacyNote: 'mncord يشوف بس أسماء البرامج الشغالة في جهازك عشان يعرف الألعاب. ما يقرأ أي شي ثاني، ويشارك اسم اللعبة بس.',
  },
  games: {
    none: 'ما في لعبة شغالة', noneSub: 'شغّل لعبة وبتطلع هنا.', playingNow: 'تلعب الحين، وأصحابك يشوفونها', hide: 'هذي مب لعبة',
    add: 'ضيفها!', addSub: 'في لعبة ناقصة؟ اخترها من البرامج الشغالة وعطها اسم.', program: 'البرنامج الشغال', name: 'اسم اللعبة', addBtn: 'إضافة اللعبة',
    yours: 'الألعاب اللي ضفتها', hidden: 'مخفية (اضغط عشان ترجعها)', knownCount: 'mncord يعرف {{count}} لعبة مشهورة من البداية.',
  },
  cos: {
    title: 'زينة البروفايل، ببلاش للكل', sub: 'خلّ بروفايلك على كيفك. الكل يشوفها في بروفايلك والمكالمات وقائمة الأعضاء.', none: 'بدون', inList: 'في قائمة الأعضاء',
    decoration: { _: 'إطار الصورة', glow: 'توهج', rainbow: 'قوس قزح', gold: 'ذهبي', neon: 'نيون', fire: 'نار', frost: 'ثلج', galaxy: 'مجرة' },
    effect: { _: 'تأثير البروفايل', sparkles: 'لمعان', snow: 'ثلج', hearts: 'قلوب', embers: 'جمر', aurora: 'شفق', stars: 'نجوم' },
    nameStyle: { _: 'ستايل الاسم', aurora: 'شفق', sunset: 'غروب', gold: 'ذهبي', neon: 'نيون', ocean: 'محيط', candy: 'حلاوة', chrome: 'كروم' },
    nameplate: { _: 'خلفية الاسم', aurora: 'شفق', sunset: 'غروب', ocean: 'محيط', ember: 'جمر', galaxy: 'مجرة', forest: 'غابة' },
  },
  layout: { rail: 'إظهار / إخفاء السيرفرات', sidebar: 'إظهار / إخفاء الرومات', members: 'إظهار / إخفاء الأعضاء' },
  gs: { discoverable: 'يمكن إيجاده بالاسم', discoverableSub: 'أي شخص يقدر يكتب اسم السيرفر في «الانضمام إلى سيرفر» ويدخل بدون دعوة.' },
  crop: { title: 'تعديل الصورة', apply: 'تطبيق', zoom: 'تكبير', working: 'جاري الحفظ…', hint: 'اسحب للتحريك · استخدم العجلة أو الشريط للتكبير' },
  update: {
    downloading: 'جاري تحميل التحديث', readyTitle: 'التحديث جاهز', readyShort: 'أعد التشغيل للتحديث', whatsNew: 'شو الجديد', later: 'بعدين', gotIt: 'حلو!',
    background: 'يتحمّل في الخلفية. كمّل سوالفك.',
  },
};

/** adds keys that don't exist yet (never overwrites) */
export function mergeInto(target: Dict, extra: Dict) {
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'string') {
      if (!(k in target)) target[k] = v;
    } else {
      const cur = target[k];
      if (cur === undefined || typeof cur === 'string') target[k] = { ...(typeof cur === 'string' ? { _: cur } : {}) };
      mergeInto(target[k] as Dict, v);
    }
  }
}
