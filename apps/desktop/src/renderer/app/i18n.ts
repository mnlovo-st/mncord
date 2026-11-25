import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AR_EXTRA, EN_EXTRA, mergeInto } from './i18n-extra';

// All copy is written fresh for mncord. Arabic is Modern Standard Arabic.
const en = {
  app: { updateReady: 'mncord {{version}} is ready.', restartNow: 'Restart now', loading: 'Starting mncord…', reconnecting: 'Reconnecting…', offline: 'You are offline. Messages will send when you reconnect.' },
  auth: {
    welcome: 'Welcome back!', welcomeSub: 'Good to see you again.',
    create: 'Create your account', createSub: 'Free forever. Every feature, for everyone.',
    email: 'Email', login: 'Email or username', username: 'Username', displayName: 'Display name', password: 'Password', dob: 'Date of birth',
    signIn: 'Sign in', signUp: 'Create account', noAccount: 'New to mncord?', register: 'Create an account', haveAccount: 'Already have an account?', toLogin: 'Sign in',
    forgot: 'Forgot your password?', usernameHint: 'Lowercase letters, numbers, dots and underscores.',
    terms: 'By creating an account you agree to the mncord Terms and Privacy Policy.',
    showPassword: 'Show password', hidePassword: 'Hide password', signOut: 'Sign out',
  },
  errors: {
    invalid_login: 'Wrong email/username or password.', email_taken: 'This email is already registered.', username_taken: 'This username is taken.',
    username_format: '2–32 characters: a–z, 0–9, dots and underscores.', password_short: 'At least 8 characters.', email_invalid: 'Enter a valid email.',
    too_young: 'You must be at least 13 years old.', dob_invalid: 'Enter your date of birth.', rate_limited: 'Too many attempts. Wait a minute and try again.',
    network: 'Can’t reach the server. Check your connection.', internal: 'Something went wrong on our side. Try again.', missing_permission: 'You don’t have permission to do that.',
    invite_invalid: 'This invite is invalid or has expired.', banned: 'You are banned from this server.', message_long: 'Messages can be up to 4000 characters.',
    guild_name_short: 'Server names need at least 2 characters.', channel_full: 'This voice channel is full.', mic_denied: 'Microphone access was blocked.', rtc_not_configured: 'Voice is not set up on this server yet.', storage_full: 'Storage is full for now. Old images and videos are cleared daily; try again later.', type_mismatch: 'That file is not what its name says.', password_breached: 'This password appeared in a data breach. Please choose another.', upload_failed: 'The upload was interrupted. Please try again.', file_too_large: 'Files can be up to 200 MB.', rtc_unavailable: 'Voice service is unreachable right now. Try again shortly.', rtc_quota: 'Voice is paused until next month (free monthly limit reached).', server_muted: 'A moderator muted you.', server_deafened: 'A moderator deafened you.', not_in_voice: 'Join the voice channel first.',
    unknown: 'Something went wrong.', slowmode: 'Slowmode is on. Wait a few seconds.', age_restricted: 'This channel is for adults (18+).', role_hierarchy: 'You can only manage roles and members below your highest role.', cannot_grant: 'You cannot give permissions you do not have.', cannot_moderate_self: 'You cannot do that to yourself.', last_text_channel: 'A server needs at least one text channel.', emoji_file_invalid: 'Emoji must be an image under 512 KB.', emoji_name: 'Emoji names: 2-32 letters, numbers or underscores.', too_many_emoji: 'This server has the maximum of 250 emoji.', too_many_roles: 'This server has the maximum of 250 roles.', owner_only: 'Only the server owner can do that.', timeout_range: 'Time outs can last up to 28 days.', allow_deny_overlap: 'A permission cannot be allowed and denied at once.', owner_cannot_leave: 'Transfer or delete your server before leaving it.', quota_exceeded: 'You have used your 5 GB of uploads. Delete some old files.', attachment_invalid: 'That file could not be attached. Upload it again.', too_many_reactions: 'That message has the maximum number of reactions.', too_many_pins: 'This channel has the maximum of 250 pins.', message_empty: 'Type a message or add a file.', not_author: 'You can only edit your own messages.', user_not_found: 'Hmm, that did not work. Check the username, or they may not accept requests.', already_friends: 'You are already friends.', request_pending: 'A request is already pending.', dm_not_allowed: 'This person only accepts messages from friends or server members.', not_friends: 'You can only add friends to a group.', group_too_large: 'Groups can have up to 10 people.', blocked: 'You cannot do that with this person.', code_invalid: 'That code is wrong or expired.', mfa_invalid: 'That code is wrong. Try the newest one.', mfa_ticket_expired: 'That took too long. Sign in again.', wrong_password: 'Wrong password.', mfa_required: 'Enter your 2FA code.', transfer_guilds_first: 'Transfer or delete the servers you own first.', account_disabled: 'This account is disabled.', conflict: 'That is already taken.',
  },
  rail: { home: 'Direct messages', add: 'Add a server', join: 'Join a server' },
  home: { title: 'Friends', soon: 'Friends and direct messages arrive in the next milestone.', pick: 'Pick a server on the left, or create one.' },
  guild: { invite: 'Invite people', textChannels: 'Text channels', voiceChannels: 'Voice channels', members: 'Members', online: 'Online', offline: 'Offline', leave: 'Leave server' },
  chat: {
    placeholder: 'Message #{{name}}', welcome: 'Welcome to #{{name}}!', welcomeSub: 'This is the start of the #{{name}} channel.',
    joined: '{{name}} joined the server.', typing_one: '{{names}} is typing…', typing_other: '{{names}} are typing…', failed: 'Not sent.', retry: 'Retry', del: 'Delete',
    noSend: 'You don’t have permission to send messages here.', loading: 'Loading messages…', today: 'Today at {{time}}', edited: '(edited)',
  },
  voice: {
    join: 'Join voice', connected: 'Voice Connected', connecting: 'Connecting…', leave: 'Disconnect', mute: 'Mute', unmute: 'Unmute', deafen: 'Deafen', undeafen: 'Undeafen',
    noise: 'AI noise suppression', empty: 'No one is here yet.', alone: 'You are the only one here. Invite a friend!', settings: 'User settings',
  },
  createGuild: {
    title: 'Create your server', sub: 'Your server is where you and your friends hang out. Make yours and start talking.',
    name: 'Server name', template: 'Start from', friends: 'Friends', gaming: 'Gaming', community: 'Community', blank: 'Blank', create: 'Create', back: 'Back', defaultName: "{{name}}'s server",
  },
  joinGuild: { title: 'Join a server', sub: 'Enter an invite link or code.', code: 'Invite link or code', join: 'Join server', preview: '{{count}} members' },
  invite: { title: 'Invite friends to {{name}}', sub: 'Send this link. It expires in 7 days.', copy: 'Copy', copied: 'Copied' },
  common: { cancel: 'Cancel', close: 'Close', save: 'Save' },
  qs: { title: 'Where to?', placeholder: 'Search channels, people and servers', tip: 'Tip: start with # for channels, @ for people, * for servers, ! for voice. Open with Ctrl+K.' },
  win: { title: 'Windows', autostart: 'Open mncord when Windows starts', autostartSub: 'Starts hidden in the tray, ready for calls.', tray: 'Minimise to tray when closed', traySub: 'Closing the window keeps you in voice and receiving messages.', notifications: 'Desktop notifications', notificationsSub: 'Show a Windows notification for DMs and mentions.' },
  ctx: { markRead: 'Mark as read', muteServer: 'Mute server', muteChannel: 'Mute channel', copyId: 'Copy ID' },
  live: {
    goLive: 'Go Live', stop: 'Stop streaming', camera: 'Turn on camera', cameraOff: 'Turn off camera', screens: 'Screens', windows: 'Applications', quality: 'Stream quality', audio: 'Share sound',
    hq: 'Higher quality uses more of the free daily allowance; on busy days the server may lower it a little to stay free.', watch: 'Watch stream', fullscreen: 'Full screen', exitFullscreen: 'Exit full screen', zoomHint: 'Scroll to zoom, drag to move', resetZoom: 'Reset zoom',
    volume: 'User volume', live: 'LIVE', serverMuted: 'Server muted by a moderator',
  },
  vs: {
    inputMode: 'Input mode', vad: 'Voice activity', ptt: 'Push to talk', pttKey: 'Shortcut', pttRecord: 'Press a key or mouse button…', pttRelease: 'Release delay', pttGlobal: 'Works while games are focused.',
    raw: 'Raw microphone (no processing)', rawSub: 'Sends your mic exactly as it is: no noise suppression, gate, EQ, compressor, limiter, echo cancellation or auto gain, and higher quality. Best with a good mic and headphones.', echo: 'Echo cancellation', agc: 'Automatic gain control', sensitivity: 'Input sensitivity (noise gate)', sensitivitySub: 'Sound quieter than the line is cut. Speak normally and set it just below your voice.', advanced: 'Advanced mic processing', highpass: 'Low-cut filter (removes rumble)', compressor: 'Compressor (evens out loud and quiet)', limiter: 'Limiter (prevents clipping)', eqLow: 'Bass', eqMid: 'Mid', eqHigh: 'Treble', reset: 'Reset to defaults',
  },
  gs: {
    menu: 'Server menu', settings: 'Server settings', createChannel: 'Create channel', createCategory: 'Create category', invite: 'Invite people', leave: 'Leave server', leaveConfirm: 'Leave {{name}}? You can only come back with a new invite.',
    overview: 'Overview', roles: 'Roles', emoji: 'Emoji', members: 'Members', bans: 'Bans', invites: 'Invites', audit: 'Audit log', deleteServer: 'Delete server', moderation: 'Moderation', management: 'Server',
    name: 'Server name', icon: 'Server icon', uploadIcon: 'Upload image', description: 'Description', systemChannel: 'System messages channel', none: 'None', notifications: 'Default notifications', allMessages: 'All messages', onlyMentions: 'Only @mentions', language: 'Server language',
    unsaved: 'Careful, you have unsaved changes!', reset: 'Reset', save: 'Save changes',
    createRole: 'Create role', roleName: 'Role name', roleColor: 'Role colour', hoist: 'Show members separately', hoistSub: 'Members with this role appear in their own group in the member list.', mentionable: 'Allow anyone to @mention this role', permissions: 'Permissions', deleteRole: 'Delete role', everyoneHint: 'Default permissions for everyone in the server.', moveUp: 'Move up', moveDown: 'Move down', clearPerms: 'Clear permissions',
    uploadEmoji: 'Upload emoji', emojiHint: 'PNG, GIF, WEBP or JPEG under 512 KB. Name: letters, numbers, underscores. Everyone can use them, free.', emojiName: 'Name', slots: '{{n}} of 250 slots used',
    searchMembers: 'Search members', kick: 'Kick', ban: 'Ban', timeout: 'Time out', removeTimeout: 'Remove time out', editRoles: 'Roles', joined: 'Joined {{when}}', owner: 'Owner', reason: 'Reason (optional)', deleteMessages: 'Delete their recent messages', dontDelete: "Don't delete any", lastHour: 'Last hour', lastDay: 'Last 24 hours', lastWeek: 'Last 7 days',
    timeoutFor: 'Time out for', m5: '5 minutes', h1: '1 hour', d1: '1 day', w1: '1 week', kickConfirm: 'Kick {{name}}? They can rejoin with an invite.', banConfirm: 'Ban {{name}}?',
    unban: 'Revoke ban', noBans: 'No bans. Peaceful.', noInvites: 'No active invites.', uses: 'Uses', expires: 'Expires', never: 'Never', revoke: 'Revoke', inviter: 'Inviter', code: 'Code', noAudit: 'Nothing here yet.',
    deleteTitle: 'Delete “{{name}}”', deleteSub: 'This removes the server, all channels and all messages for everyone. It cannot be undone.', deleteConfirm: 'Delete server',
  },
  ch: {
    create: 'Create channel', createIn: 'in {{name}}', type: 'Channel type', text: 'Text', textSub: 'Messages, images, links, emoji', voice: 'Voice', voiceSub: 'Talk, video and screen share', announcement: 'Announcement', announcementSub: 'Important updates people can follow', category: 'Category',
    name: 'Channel name', private: 'Private channel', privateSub: 'Only selected roles and members can see it.', settings: 'Edit channel', overview: 'Overview', permissions: 'Permissions', topic: 'Topic', slowmode: 'Slowmode', off: 'Off', s5: '5s', s30: '30s', m1: '1m', m5: '5m', m15: '15m', h1: '1h',
    bitrate: 'Bitrate', userLimit: 'User limit', noLimit: 'No limit', nsfw: 'Age-restricted channel', deleteChannel: 'Delete channel', deleteConfirm: 'Delete #{{name}}? Its messages will be gone for good.',
    rolesMembers: 'Roles / members', addRole: 'Add a role or member', allow: 'Allow', neutral: 'Inherit', deny: 'Deny', removeOverwrite: 'Remove',
  },
  perm: {
    general: 'General', text: 'Text', voice: 'Voice', members: 'Members', advanced: 'Advanced',
    VIEW_CHANNEL: 'View channels', SEND_MESSAGES: 'Send messages', READ_HISTORY: 'Read message history', ADD_REACTIONS: 'Add reactions', ATTACH_FILES: 'Attach files', EMBED_LINKS: 'Embed links', MENTION_EVERYONE: 'Mention @everyone', USE_EXTERNAL_EMOJI: 'Use emoji from other servers', MANAGE_MESSAGES: 'Manage messages', CREATE_INVITE: 'Create invites', CREATE_THREADS: 'Create threads', MANAGE_THREADS: 'Manage threads', SEND_IN_THREADS: 'Send in threads',
    CONNECT: 'Connect', SPEAK: 'Speak', STREAM: 'Video and screen share', USE_VOICE_ACTIVITY: 'Use voice activity', PRIORITY_SPEAKER: 'Priority speaker', USE_SOUNDBOARD: 'Use soundboard', MUTE_MEMBERS: 'Mute members', DEAFEN_MEMBERS: 'Deafen members', MOVE_MEMBERS: 'Move members',
    CHANGE_NICKNAME: 'Change own nickname', MANAGE_NICKNAMES: 'Manage nicknames', KICK_MEMBERS: 'Kick members', BAN_MEMBERS: 'Ban members', TIMEOUT_MEMBERS: 'Time out members',
    MANAGE_CHANNELS: 'Manage channels', MANAGE_ROLES: 'Manage roles', MANAGE_WEBHOOKS: 'Manage webhooks', MANAGE_EXPRESSIONS: 'Manage emoji and stickers', MANAGE_EVENTS: 'Manage events', MANAGE_GUILD: 'Manage server', VIEW_AUDIT_LOG: 'View audit log', ADMINISTRATOR: 'Administrator',
    ADMINISTRATOR_SUB: 'Every permission, and bypasses channel overwrites. Give carefully.',
  },
  audit: {
    guild_update: 'updated the server', role_create: 'created a role', role_update: 'updated a role', role_delete: 'deleted a role', role_reorder: 'reordered roles', member_update: 'updated a member', member_kick: 'kicked a member', member_ban: 'banned a member', member_unban: 'unbanned a member',
    invite_delete: 'revoked an invite', channel_create: 'created a channel', channel_update: 'updated a channel', channel_delete: 'deleted a channel', overwrite_update: 'changed channel permissions', overwrite_delete: 'removed channel permissions', emoji_create: 'added an emoji', emoji_delete: 'removed an emoji',
  },
  msg: {
    react: 'Add reaction', reply: 'Reply', edit: 'Edit', del: 'Delete message', pin: 'Pin message', unpin: 'Unpin message', copy: 'Copy text', more: 'More',
    editHint: 'Escape to cancel · Enter to save', replyingTo: 'Replying to {{name}}', cancelReply: 'Cancel reply', toolbar: 'Message actions',
    deleteTitle: 'Delete message', deleteSub: 'Are you sure you want to delete this message?', deleteConfirm: 'Delete',
    pinned: '{{name}} pinned a message to this channel.', newMessages: 'New messages', loadingOlder: 'Loading older messages…', beginning: 'This is the beginning of the conversation.',
    attach: 'Upload a file', emoji: 'Emoji', dropHere: 'Drop files to upload to #{{name}}', spoiler: 'Mark as spoiler', removeFile: 'Remove file', uploading: 'Uploading {{pct}}%', download: 'Download', expired: 'This file has expired. Images and videos are kept for 14 days.',
    openLink: 'Leaving mncord', openLinkSub: 'This link goes to an external website:', openLinkGo: 'Open link', image: 'Image', jumpPresent: 'Jump to present',
  },
  search: { placeholder: 'Search', title: 'Search results', results: '{{count}} results', none: 'No results. Try other words.', from: 'from', close: 'Close', jump: 'Jump' },
  pins: { title: 'Pinned messages', none: 'No pinned messages in this channel yet.', unpin: 'Unpin', jump: 'Jump' },
  friends: {
    title: 'Friends', online: 'Online', all: 'All', pending: 'Pending', blocked: 'Blocked', add: 'Add friend',
    addTitle: 'Add friend', addSub: 'You can add friends with their mncord username.', addPlaceholder: 'Enter a username', send: 'Send friend request', sent: 'Friend request sent to {{name}}.',
    countOnline: 'Online — {{count}}', countAll: 'All friends — {{count}}', countPending: 'Pending — {{count}}', countBlocked: 'Blocked — {{count}}',
    incoming: 'Incoming friend request', outgoing: 'Outgoing friend request', accept: 'Accept', decline: 'Decline', cancel: 'Cancel request', unblock: 'Unblock', remove: 'Remove friend', block: 'Block',
    message: 'Message', call: 'Start voice call', emptyOnline: 'No one is around right now.', emptyAll: 'No friends yet. Add someone by their username!', emptyPending: 'No pending requests.', emptyBlocked: 'You have not blocked anyone.',
    dms: 'Direct messages', newGroup: 'Create group DM', closeDm: 'Close DM', search: 'Search',
    groupTitle: 'Select friends', groupSub: 'You can add {{left}} more.', create: 'Create group', groupName: 'Group name',
  },
  dm: { start: 'This is the beginning of your direct messages with {{name}}.', groupStart: 'Welcome to the start of the {{name}} group.', blocked: 'You cannot send messages in this conversation.', placeholder: 'Message @{{name}}' },
  call: { incoming: 'Incoming call', from: '{{name}} is calling…', accept: 'Accept', decline: 'Decline', ringing: 'Ringing…', inCall: 'In call', join: 'Join call', leave: 'Leave call' },
  profile: { member: 'mncord member since', aboutMe: 'About me', mutualServers_one: '1 mutual server', mutualServers_other: '{{count}} mutual servers', mutualFriends_one: '1 mutual friend', mutualFriends_other: '{{count}} mutual friends', message: 'Message', addFriend: 'Add friend', pending: 'Request sent', friends: 'Friends', block: 'Block', unblock: 'Unblock', you: 'This is you', copyId: 'Copy user ID' },
  status: { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline', invisible: 'Invisible', custom: 'Set a custom status' },
  mfa: { title: 'Two-factor authentication', sub: 'Enter the 6-digit code from your authenticator app.', code: 'Code', backupHint: 'Lost your phone? Enter one of your backup codes (xxxx-xxxx).', verify: 'Verify', back: 'Back to sign in' },
  forgot: { title: 'Reset your password', sub: 'We will email you a 6-digit code.', send: 'Send code', codeSent: 'If that email has an account, a code is on its way.', code: 'Code from the email', newPassword: 'New password', reset: 'Reset password' },
  badges: { dev: 'mncord Developer' },
  profileEdit: { title: 'Profiles', displayName: 'Display name', pronouns: 'Pronouns', pronounsHint: 'he/him, she/her, they/them…', avatar: 'Avatar', changeAvatar: 'Change avatar', banner: 'Profile banner', changeBanner: 'Upload banner', remove: 'Remove', color: 'Profile colour', custom: 'Custom colour', default: 'Use default', status: 'Custom status', statusHint: 'What are you up to?', about: 'About me', save: 'Save changes', reset: 'Reset', saved: 'Saved.', preview: 'Preview' },
  titlebar: { back: 'Back', forward: 'Forward', inbox: 'Inbox', mentions: 'Mentions', noMentions: 'No mentions yet. When someone @mentions you, it shows up here.', help: 'Help' },
  approvals: { group: 'Owner', title: 'Approvals', sub: 'New accounts can use mncord only after you approve them, once. Declining switches the account off.', empty: 'Nobody is waiting right now.', approve: 'Approve', decline: 'Decline', verified: 'email verified', unverified: 'email not verified yet' },
  gate: { verifyTitle: 'Check your email', verifySub: 'Enter the 6-digit code we sent to {{email}} to finish creating your account.', spam: 'No email? Check your spam folder, or send a new code.', pendingTitle: 'Waiting for approval', pendingSub: 'Your email is verified. The mncord owner reviews every new account; you can start as soon as yours is approved. This page checks by itself every few seconds.', check: 'Check again', stillWaiting: 'Not approved yet. We will keep checking.' },
  verifyEmail: { banner: 'Please verify your email to keep your account safe.', action: 'Verify now', title: 'Verify your email', sub: 'We sent a 6-digit code to {{email}}.', code: 'Code', confirm: 'Verify', resend: 'Send a new code', resent: 'New code sent.', done: 'Email verified. Thank you!' },
  settings: {
    title: 'Settings', user: 'User settings', app: 'App settings', account: 'My account', security: 'Privacy & security', devices: 'Devices', appearance: 'Appearance', language: 'Language', voice: 'Voice & audio', logout: 'Sign out', close: 'Close settings',
    changeAvatar: 'Change avatar', profile: 'Profile', displayName: 'Display name', bio: 'About me', pronouns: 'Pronouns', save: 'Save changes', saved: 'Saved',
    username: 'Username', email: 'Email', edit: 'Edit', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password', passwordChanged: 'Password changed. Other devices were signed out.',
    confirmPassword: 'Enter your password to continue', verified: 'Verified', unverified: 'Not verified',
    mfaTitle: 'Two-factor authentication', mfaOff: 'Add a second step to sign-in. Even with your password, nobody gets in without your phone.', mfaOn: '2FA is on. {{left}} backup codes left.',
    enable2fa: 'Enable 2FA', disable2fa: 'Remove 2FA', regen: 'New backup codes', scan: '1. Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 2FAS, Aegis).',
    manual: 'Cannot scan? Type this key:', enterCode: '2. Enter the 6-digit code it shows', backupTitle: 'Save your backup codes', backupSub: 'Each code works once if you lose your phone. They will not be shown again.', copyCodes: 'Copy codes', done: 'Done', mfaCodeOrBackup: '2FA code or backup code',
    devicesSub: 'These devices are signed in to your account.', thisDevice: 'This device', lastActive: 'Last active {{when}}', signOutDevice: 'Sign out', signOutAll: 'Sign out of all other devices', unknownDevice: 'Unknown device',
    deleteTitle: 'Delete account', deleteSub: 'Deleting schedules your account for removal in 14 days. Sign in again before then to cancel.', deleteBtn: 'Delete account', deleteConfirm: 'Delete my account',
    theme: 'Theme', midnight: 'Midnight', light: 'Light', amoled: 'AMOLED black', density: 'Message density', cozy: 'Cozy', compact: 'Compact', fontScale: 'Font size', reducedMotion: 'Reduce motion', reducedMotionSub: 'Turn off most animations.',
    languageSub: 'mncord speaks English and Modern Standard Arabic. Arabic switches the whole app to right-to-left.',
    inputDevice: 'Input device', outputDevice: 'Output device', default: 'Default', suppression: 'Noise suppression', ai: 'AI (GTCRN), strongest', rnnoise: 'RNNoise, light', off: 'Off', micTest: 'Mic test', micTestSub: 'Speak and watch the meter. Turn on monitoring to hear yourself.', monitor: 'Hear myself', stopTest: 'Stop test', startTest: 'Start test',
  },
};

const ar: typeof en = {
  app: { updateReady: 'الإصدار {{version}} من mncord جاهز.', restartNow: 'أعد التشغيل الآن', loading: 'جارٍ تشغيل mncord…', reconnecting: 'جارٍ إعادة الاتصال…', offline: 'أنت غير متصل. ستُرسل الرسائل عند عودة الاتصال.' },
  auth: {
    welcome: 'أهلًا بعودتك!', welcomeSub: 'سعداء برؤيتك مجددًا.',
    create: 'أنشئ حسابك', createSub: 'مجاني إلى الأبد. كل المزايا للجميع.',
    email: 'البريد الإلكتروني', login: 'البريد الإلكتروني أو اسم المستخدم', username: 'اسم المستخدم', displayName: 'الاسم الظاهر', password: 'كلمة المرور', dob: 'تاريخ الميلاد',
    signIn: 'تسجيل الدخول', signUp: 'إنشاء الحساب', noAccount: 'جديد على mncord؟', register: 'أنشئ حسابًا', haveAccount: 'لديك حساب بالفعل؟', toLogin: 'سجّل الدخول',
    forgot: 'نسيت كلمة المرور؟', usernameHint: 'أحرف لاتينية صغيرة وأرقام ونقاط وشرطات سفلية.',
    terms: 'بإنشائك حسابًا فإنك توافق على شروط mncord وسياسة الخصوصية.',
    showPassword: 'إظهار كلمة المرور', hidePassword: 'إخفاء كلمة المرور', signOut: 'تسجيل الخروج',
  },
  errors: {
    invalid_login: 'البريد/اسم المستخدم أو كلمة المرور غير صحيحة.', email_taken: 'هذا البريد مسجّل مسبقًا.', username_taken: 'اسم المستخدم هذا محجوز.',
    username_format: 'من 2 إلى 32 حرفًا: a–z و0–9 والنقاط والشرطات السفلية.', password_short: '8 أحرف على الأقل.', email_invalid: 'أدخل بريدًا إلكترونيًا صحيحًا.',
    too_young: 'يجب ألا يقل عمرك عن 13 عامًا.', dob_invalid: 'أدخل تاريخ ميلادك.', rate_limited: 'محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.',
    network: 'تعذّر الوصول إلى الخادم. تحقّق من اتصالك.', internal: 'حدث خطأ من جهتنا. أعد المحاولة.', missing_permission: 'ليست لديك صلاحية لذلك.',
    invite_invalid: 'هذه الدعوة غير صالحة أو منتهية.', banned: 'أنت محظور من هذا الخادم.', message_long: 'الحد الأقصى للرسالة 4000 حرف.',
    guild_name_short: 'يجب أن يتكوّن اسم الخادم من حرفين على الأقل.', channel_full: 'هذه القناة الصوتية ممتلئة.', mic_denied: 'تم حظر الوصول إلى الميكروفون.', rtc_not_configured: 'لم يُفعَّل الصوت على هذا الخادم بعد.', storage_full: 'المساحة ممتلئة حاليًا. تُحذف الصور والمقاطع القديمة يوميًا؛ حاول لاحقًا.', type_mismatch: 'هذا الملف ليس كما يدّعي اسمه.', password_breached: 'ظهرت كلمة المرور هذه في تسريب بيانات. اختر كلمة أخرى.', upload_failed: 'انقطع الرفع. حاول مرة أخرى.', file_too_large: 'الحد الأقصى لحجم الملف 200 ميغابايت.', rtc_unavailable: 'خدمة الصوت غير متاحة الآن. حاول بعد قليل.', rtc_quota: 'الصوت متوقف حتى الشهر القادم (بلغنا الحد المجاني الشهري).', server_muted: 'كتمك أحد المشرفين.', server_deafened: 'أوقف أحد المشرفين الصوت عنك.', not_in_voice: 'انضم إلى القناة الصوتية أولًا.',
    unknown: 'حدث خطأ ما.', slowmode: 'الوضع البطيء مفعّل. انتظر بضع ثوانٍ.', age_restricted: 'هذه القناة للبالغين (18+).', role_hierarchy: 'يمكنك إدارة الأدوار والأعضاء الأدنى من أعلى دور لديك فقط.', cannot_grant: 'لا يمكنك منح صلاحيات لا تملكها.', cannot_moderate_self: 'لا يمكنك فعل ذلك بنفسك.', last_text_channel: 'يحتاج الخادم إلى قناة نصية واحدة على الأقل.', emoji_file_invalid: 'يجب أن يكون الرمز صورة أقل من 512 كيلوبايت.', emoji_name: 'أسماء الرموز: من 2 إلى 32 حرفًا لاتينيًا أو رقمًا أو شرطة سفلية.', too_many_emoji: 'وصل الخادم إلى الحد الأقصى (250 رمزًا).', too_many_roles: 'وصل الخادم إلى الحد الأقصى (250 دورًا).', owner_only: 'هذا متاح لمالك الخادم فقط.', timeout_range: 'الحد الأقصى للإيقاف المؤقت 28 يومًا.', allow_deny_overlap: 'لا يمكن السماح بالصلاحية ومنعها معًا.', owner_cannot_leave: 'انقل ملكية خادمك أو احذفه قبل المغادرة.', quota_exceeded: 'استهلكت مساحتك (5 غيغابايت). احذف بعض الملفات القديمة.', attachment_invalid: 'تعذّر إرفاق الملف. ارفعه مجددًا.', too_many_reactions: 'وصلت هذه الرسالة إلى الحد الأقصى من التفاعلات.', too_many_pins: 'وصلت هذه القناة إلى الحد الأقصى (250 رسالة مثبتة).', message_empty: 'اكتب رسالة أو أضف ملفًا.', not_author: 'يمكنك تعديل رسائلك فقط.', user_not_found: 'لم ينجح ذلك. تحقّق من اسم المستخدم، أو ربما لا يقبل الطلبات.', already_friends: 'أنتما صديقان بالفعل.', request_pending: 'هناك طلب معلّق بالفعل.', dm_not_allowed: 'هذا الشخص يستقبل الرسائل من الأصدقاء أو أعضاء الخوادم فقط.', not_friends: 'يمكنك إضافة الأصدقاء فقط إلى المجموعة.', group_too_large: 'الحد الأقصى للمجموعة 10 أشخاص.', blocked: 'لا يمكنك فعل ذلك مع هذا الشخص.', code_invalid: 'الرمز غير صحيح أو منتهي الصلاحية.', mfa_invalid: 'الرمز غير صحيح. جرّب أحدث رمز.', mfa_ticket_expired: 'استغرق الأمر وقتًا طويلًا. سجّل الدخول مجددًا.', wrong_password: 'كلمة المرور غير صحيحة.', mfa_required: 'أدخل رمز التحقق بخطوتين.', transfer_guilds_first: 'انقل ملكية خوادمك أو احذفها أولًا.', account_disabled: 'هذا الحساب معطّل.', conflict: 'هذا مستخدم بالفعل.',
  },
  rail: { home: 'الرسائل الخاصة', add: 'إضافة خادم', join: 'الانضمام إلى خادم' },
  home: { title: 'الأصدقاء', soon: 'الأصدقاء والرسائل الخاصة قادمة في المرحلة التالية.', pick: 'اختر خادمًا من القائمة، أو أنشئ خادمًا جديدًا.' },
  guild: { invite: 'دعوة أشخاص', textChannels: 'القنوات النصية', voiceChannels: 'القنوات الصوتية', members: 'الأعضاء', online: 'متصل', offline: 'غير متصل', leave: 'مغادرة الخادم' },
  chat: {
    placeholder: 'أرسل رسالة إلى ⁨#{{name}}⁩', welcome: 'أهلًا بك في ⁨#{{name}}⁩!', welcomeSub: 'هذه بداية قناة ⁨#{{name}}⁩.',
    joined: 'انضم \u2068{{name}}\u2069 إلى الخادم.', typing_one: '\u2068{{names}}\u2069 يكتب…', typing_other: '\u2068{{names}}\u2069 يكتبون…', failed: 'لم تُرسل.', retry: 'أعد المحاولة', del: 'احذف',
    noSend: 'ليست لديك صلاحية لإرسال الرسائل هنا.', loading: 'جارٍ تحميل الرسائل…', today: 'اليوم {{time}}', edited: '(معدّلة)',
  },
  voice: {
    join: 'انضم إلى الصوت', connected: 'متصل بالصوت', connecting: 'جارٍ الاتصال…', leave: 'قطع الاتصال', mute: 'كتم الميكروفون', unmute: 'إلغاء الكتم', deafen: 'كتم الصوت', undeafen: 'إلغاء كتم الصوت',
    noise: 'عزل الضوضاء بالذكاء الاصطناعي', empty: 'لا أحد هنا بعد.', alone: 'أنت وحدك هنا. ادعُ صديقًا!', settings: 'إعدادات المستخدم',
  },
  createGuild: {
    title: 'أنشئ خادمك', sub: 'خادمك هو المكان الذي تجتمع فيه مع أصدقائك. أنشئه وابدأ الحديث.',
    name: 'اسم الخادم', template: 'ابدأ من', friends: 'أصدقاء', gaming: 'ألعاب', community: 'مجتمع', blank: 'فارغ', create: 'إنشاء', back: 'رجوع', defaultName: 'خادم {{name}}',
  },
  joinGuild: { title: 'الانضمام إلى خادم', sub: 'أدخل رابط الدعوة أو رمزها.', code: 'رابط الدعوة أو رمزها', join: 'انضم إلى الخادم', preview: '{{count}} عضو' },
  invite: { title: 'ادعُ أصدقاءك إلى \u2068{{name}}\u2069', sub: 'أرسل هذا الرابط. تنتهي صلاحيته خلال 7 أيام.', copy: 'نسخ', copied: 'تم النسخ' },
  common: { cancel: 'إلغاء', close: 'إغلاق', save: 'حفظ' },
  qs: { title: 'إلى أين؟', placeholder: 'ابحث عن قنوات وأشخاص وخوادم', tip: 'نصيحة: ابدأ بـ # للقنوات و@ للأشخاص و* للخوادم و! للصوت. افتحه بـ Ctrl+K.' },
  win: { title: 'ويندوز', autostart: 'تشغيل mncord عند بدء ويندوز', autostartSub: 'يبدأ مخفيًا في شريط النظام وجاهزًا للمكالمات.', tray: 'التصغير إلى شريط النظام عند الإغلاق', traySub: 'إغلاق النافذة يبقيك في الصوت ويستقبل الرسائل.', notifications: 'إشعارات سطح المكتب', notificationsSub: 'عرض إشعار ويندوز للرسائل الخاصة والإشارات.' },
  ctx: { markRead: 'تعليم كمقروء', muteServer: 'كتم الخادم', muteChannel: 'كتم القناة', copyId: 'نسخ المعرّف' },
  live: {
    goLive: 'ابدأ البث', stop: 'إيقاف البث', camera: 'تشغيل الكاميرا', cameraOff: 'إيقاف الكاميرا', screens: 'الشاشات', windows: 'التطبيقات', quality: 'جودة البث', audio: 'مشاركة الصوت',
    hq: 'الجودة الأعلى تستهلك أكثر من الحد اليومي المجاني؛ في الأيام المزدحمة ممكن السيرفر يخففها شوي عشان يبقى مجاني.', watch: 'شاهد البث', fullscreen: 'ملء الشاشة', exitFullscreen: 'الخروج من ملء الشاشة', zoomHint: 'مرّر للتكبير واسحب للتحريك', resetZoom: 'إعادة التكبير',
    volume: 'مستوى صوت المستخدم', live: 'مباشر', serverMuted: 'تم كتمك من قِبل مشرف',
  },
  vs: {
    inputMode: 'وضع الإدخال', vad: 'كشف الصوت', ptt: 'اضغط للتحدث', pttKey: 'الاختصار', pttRecord: 'اضغط زرًا في لوحة المفاتيح أو الفأرة…', pttRelease: 'تأخير الإفلات', pttGlobal: 'يعمل حتى أثناء اللعب.',
    raw: 'مايك خام (بدون أي معالجة)', rawSub: 'يرسل صوت المايك كما هو بالضبط: بلا عزل ضوضاء ولا بوابة صوت ولا معادل ولا ضاغط ولا محدِّد ولا إلغاء صدى ولا تحكم تلقائي بالعلو، وبجودة أعلى. الأفضل مع مايك جيد وسماعات.', echo: 'إلغاء الصدى', agc: 'التحكم التلقائي بالكسب', sensitivity: 'حساسية الإدخال (بوابة الضوضاء)', sensitivitySub: 'يُقطع أي صوت أهدأ من الخط. تحدّث بشكل طبيعي واضبطه أسفل صوتك بقليل.', advanced: 'معالجة متقدمة للميكروفون', highpass: 'مرشح القطع المنخفض (يزيل الهمهمة)', compressor: 'الضاغط (يوازن الصوت العالي والمنخفض)', limiter: 'المحدّد (يمنع التشويه)', eqLow: 'الجهير', eqMid: 'الوسط', eqHigh: 'الحدة', reset: 'استعادة الافتراضي',
  },
  gs: {
    menu: 'قائمة الخادم', settings: 'إعدادات الخادم', createChannel: 'إنشاء قناة', createCategory: 'إنشاء فئة', invite: 'دعوة أشخاص', leave: 'مغادرة الخادم', leaveConfirm: 'مغادرة \u2068{{name}}\u2069؟ لا يمكنك العودة إلا بدعوة جديدة.',
    overview: 'نظرة عامة', roles: 'الأدوار', emoji: 'الرموز التعبيرية', members: 'الأعضاء', bans: 'المحظورون', invites: 'الدعوات', audit: 'سجل التدقيق', deleteServer: 'حذف الخادم', moderation: 'الإشراف', management: 'الخادم',
    name: 'اسم الخادم', icon: 'أيقونة الخادم', uploadIcon: 'رفع صورة', description: 'الوصف', systemChannel: 'قناة رسائل النظام', none: 'لا شيء', notifications: 'الإشعارات الافتراضية', allMessages: 'كل الرسائل', onlyMentions: 'الإشارات @ فقط', language: 'لغة الخادم',
    unsaved: 'انتبه، لديك تغييرات غير محفوظة!', reset: 'إعادة تعيين', save: 'حفظ التغييرات',
    createRole: 'إنشاء دور', roleName: 'اسم الدور', roleColor: 'لون الدور', hoist: 'عرض الأعضاء بشكل منفصل', hoistSub: 'يظهر أصحاب هذا الدور في مجموعة خاصة بهم في قائمة الأعضاء.', mentionable: 'السماح للجميع بالإشارة @ إلى هذا الدور', permissions: 'الصلاحيات', deleteRole: 'حذف الدور', everyoneHint: 'الصلاحيات الافتراضية لكل من في الخادم.', moveUp: 'تحريك لأعلى', moveDown: 'تحريك لأسفل', clearPerms: 'مسح الصلاحيات',
    uploadEmoji: 'رفع رمز تعبيري', emojiHint: 'PNG أو GIF أو WEBP أو JPEG بحجم أقل من 512 كيلوبايت. الاسم: أحرف لاتينية وأرقام وشرطة سفلية. متاح للجميع مجانًا.', emojiName: 'الاسم', slots: 'مستخدم {{n}} من 250',
    searchMembers: 'ابحث عن عضو', kick: 'طرد', ban: 'حظر', timeout: 'إيقاف مؤقت', removeTimeout: 'إلغاء الإيقاف المؤقت', editRoles: 'الأدوار', joined: 'انضم {{when}}', owner: 'المالك', reason: 'السبب (اختياري)', deleteMessages: 'حذف رسائله الأخيرة', dontDelete: 'لا تحذف شيئًا', lastHour: 'آخر ساعة', lastDay: 'آخر 24 ساعة', lastWeek: 'آخر 7 أيام',
    timeoutFor: 'إيقاف مؤقت لمدة', m5: '5 دقائق', h1: 'ساعة', d1: 'يوم', w1: 'أسبوع', kickConfirm: 'طرد \u2068{{name}}\u2069؟ يمكنه العودة بدعوة.', banConfirm: 'حظر \u2068{{name}}\u2069؟',
    unban: 'إلغاء الحظر', noBans: 'لا يوجد محظورون. الأجواء هادئة.', noInvites: 'لا دعوات نشطة.', uses: 'الاستخدامات', expires: 'تنتهي', never: 'أبدًا', revoke: 'إلغاء', inviter: 'المُرسِل', code: 'الرمز', noAudit: 'لا شيء هنا بعد.',
    deleteTitle: 'حذف «\u2068{{name}}\u2069»', deleteSub: 'سيُحذف الخادم وكل القنوات والرسائل للجميع. لا يمكن التراجع.', deleteConfirm: 'حذف الخادم',
  },
  ch: {
    create: 'إنشاء قناة', createIn: 'في \u2068{{name}}\u2069', type: 'نوع القناة', text: 'نصية', textSub: 'رسائل وصور وروابط ورموز', voice: 'صوتية', voiceSub: 'تحدّث وفيديو ومشاركة شاشة', announcement: 'إعلانات', announcementSub: 'تحديثات مهمة يمكن متابعتها', category: 'فئة',
    name: 'اسم القناة', private: 'قناة خاصة', privateSub: 'لا يراها إلا الأدوار والأعضاء المحددون.', settings: 'تعديل القناة', overview: 'نظرة عامة', permissions: 'الصلاحيات', topic: 'الموضوع', slowmode: 'الوضع البطيء', off: 'إيقاف', s5: '5 ث', s30: '30 ث', m1: '1 د', m5: '5 د', m15: '15 د', h1: '1 س',
    bitrate: 'معدل البت', userLimit: 'حد المستخدمين', noLimit: 'بلا حد', nsfw: 'قناة مقيّدة بالعمر', deleteChannel: 'حذف القناة', deleteConfirm: 'حذف ⁨#{{name}}⁩؟ ستختفي رسائلها نهائيًا.',
    rolesMembers: 'الأدوار / الأعضاء', addRole: 'أضف دورًا أو عضوًا', allow: 'سماح', neutral: 'وراثة', deny: 'منع', removeOverwrite: 'إزالة',
  },
  perm: {
    general: 'عام', text: 'نصي', voice: 'صوتي', members: 'الأعضاء', advanced: 'متقدم',
    VIEW_CHANNEL: 'عرض القنوات', SEND_MESSAGES: 'إرسال الرسائل', READ_HISTORY: 'قراءة سجل الرسائل', ADD_REACTIONS: 'إضافة تفاعلات', ATTACH_FILES: 'إرفاق ملفات', EMBED_LINKS: 'تضمين الروابط', MENTION_EVERYONE: 'الإشارة إلى @everyone', USE_EXTERNAL_EMOJI: 'استخدام رموز خوادم أخرى', MANAGE_MESSAGES: 'إدارة الرسائل', CREATE_INVITE: 'إنشاء دعوات', CREATE_THREADS: 'إنشاء سلاسل', MANAGE_THREADS: 'إدارة السلاسل', SEND_IN_THREADS: 'الإرسال في السلاسل',
    CONNECT: 'الاتصال', SPEAK: 'التحدث', STREAM: 'الفيديو ومشاركة الشاشة', USE_VOICE_ACTIVITY: 'استخدام كشف الصوت', PRIORITY_SPEAKER: 'متحدث ذو أولوية', USE_SOUNDBOARD: 'استخدام لوحة الأصوات', MUTE_MEMBERS: 'كتم الأعضاء', DEAFEN_MEMBERS: 'كتم الصوت عن الأعضاء', MOVE_MEMBERS: 'نقل الأعضاء',
    CHANGE_NICKNAME: 'تغيير اللقب الخاص', MANAGE_NICKNAMES: 'إدارة الألقاب', KICK_MEMBERS: 'طرد الأعضاء', BAN_MEMBERS: 'حظر الأعضاء', TIMEOUT_MEMBERS: 'إيقاف الأعضاء مؤقتًا',
    MANAGE_CHANNELS: 'إدارة القنوات', MANAGE_ROLES: 'إدارة الأدوار', MANAGE_WEBHOOKS: 'إدارة الويب هوك', MANAGE_EXPRESSIONS: 'إدارة الرموز والملصقات', MANAGE_EVENTS: 'إدارة الفعاليات', MANAGE_GUILD: 'إدارة الخادم', VIEW_AUDIT_LOG: 'عرض سجل التدقيق', ADMINISTRATOR: 'مسؤول',
    ADMINISTRATOR_SUB: 'كل الصلاحيات ويتجاوز صلاحيات القنوات. امنحه بحذر.',
  },
  audit: {
    guild_update: 'حدّث الخادم', role_create: 'أنشأ دورًا', role_update: 'حدّث دورًا', role_delete: 'حذف دورًا', role_reorder: 'أعاد ترتيب الأدوار', member_update: 'حدّث عضوًا', member_kick: 'طرد عضوًا', member_ban: 'حظر عضوًا', member_unban: 'ألغى حظر عضو',
    invite_delete: 'ألغى دعوة', channel_create: 'أنشأ قناة', channel_update: 'حدّث قناة', channel_delete: 'حذف قناة', overwrite_update: 'غيّر صلاحيات قناة', overwrite_delete: 'أزال صلاحيات قناة', emoji_create: 'أضاف رمزًا تعبيريًا', emoji_delete: 'أزال رمزًا تعبيريًا',
  },
  msg: {
    react: 'أضف تفاعلًا', reply: 'رد', edit: 'تعديل', del: 'حذف الرسالة', pin: 'تثبيت الرسالة', unpin: 'إلغاء التثبيت', copy: 'نسخ النص', more: 'المزيد',
    editHint: 'Escape للإلغاء · Enter للحفظ', replyingTo: 'رد على \u2068{{name}}\u2069', cancelReply: 'إلغاء الرد', toolbar: 'إجراءات الرسالة',
    deleteTitle: 'حذف الرسالة', deleteSub: 'هل أنت متأكد من حذف هذه الرسالة؟', deleteConfirm: 'حذف',
    pinned: 'ثبّت \u2068{{name}}\u2069 رسالة في هذه القناة.', newMessages: 'رسائل جديدة', loadingOlder: 'جارٍ تحميل الرسائل الأقدم…', beginning: 'هذه بداية المحادثة.',
    attach: 'رفع ملف', emoji: 'رموز تعبيرية', dropHere: 'أفلت الملفات لرفعها إلى ⁨#{{name}}⁩', spoiler: 'تمييز كحرق للأحداث', removeFile: 'إزالة الملف', uploading: 'جارٍ الرفع {{pct}}٪', download: 'تنزيل', expired: 'انتهت صلاحية هذا الملف. تُحفَظ الصور ومقاطع الفيديو لمدة 14 يومًا.',
    openLink: 'مغادرة mncord', openLinkSub: 'هذا الرابط يؤدي إلى موقع خارجي:', openLinkGo: 'افتح الرابط', image: 'صورة', jumpPresent: 'الانتقال إلى الأحدث',
  },
  search: { placeholder: 'بحث', title: 'نتائج البحث', results: '{{count}} نتيجة', none: 'لا نتائج. جرّب كلمات أخرى.', from: 'من', close: 'إغلاق', jump: 'انتقال' },
  pins: { title: 'الرسائل المثبّتة', none: 'لا رسائل مثبّتة في هذه القناة بعد.', unpin: 'إلغاء التثبيت', jump: 'انتقال' },
  friends: {
    title: 'الأصدقاء', online: 'المتصلون', all: 'الكل', pending: 'قيد الانتظار', blocked: 'المحظورون', add: 'إضافة صديق',
    addTitle: 'إضافة صديق', addSub: 'يمكنك إضافة أصدقاء باسم المستخدم الخاص بهم في mncord.', addPlaceholder: 'أدخل اسم مستخدم', send: 'أرسل طلب صداقة', sent: 'تم إرسال طلب الصداقة إلى \u2068{{name}}\u2069.',
    countOnline: 'المتصلون — {{count}}', countAll: 'كل الأصدقاء — {{count}}', countPending: 'قيد الانتظار — {{count}}', countBlocked: 'المحظورون — {{count}}',
    incoming: 'طلب صداقة وارد', outgoing: 'طلب صداقة صادر', accept: 'قبول', decline: 'رفض', cancel: 'إلغاء الطلب', unblock: 'إلغاء الحظر', remove: 'إزالة الصديق', block: 'حظر',
    message: 'رسالة', call: 'بدء مكالمة صوتية', emptyOnline: 'لا أحد متصل الآن.', emptyAll: 'لا أصدقاء بعد. أضف أحدًا باسم المستخدم!', emptyPending: 'لا طلبات معلّقة.', emptyBlocked: 'لم تحظر أحدًا.',
    dms: 'الرسائل الخاصة', newGroup: 'إنشاء مجموعة', closeDm: 'إغلاق المحادثة', search: 'بحث',
    groupTitle: 'اختر أصدقاء', groupSub: 'يمكنك إضافة {{left}} آخرين.', create: 'إنشاء المجموعة', groupName: 'اسم المجموعة',
  },
  dm: { start: 'هذه بداية رسائلك الخاصة مع \u2068{{name}}\u2069.', groupStart: 'أهلًا بك في بداية مجموعة \u2068{{name}}\u2069.', blocked: 'لا يمكنك إرسال رسائل في هذه المحادثة.', placeholder: 'أرسل رسالة إلى ⁨@{{name}}⁩' },
  call: { incoming: 'مكالمة واردة', from: '\u2068{{name}}\u2069 يتصل بك…', accept: 'قبول', decline: 'رفض', ringing: 'جارٍ الرنين…', inCall: 'في مكالمة', join: 'انضم إلى المكالمة', leave: 'مغادرة المكالمة' },
  profile: { member: 'عضو في mncord منذ', aboutMe: 'نبذة عني', mutualServers_one: 'سيرفر مشترك واحد', mutualServers_other: '{{count}} سيرفرات مشتركة', mutualFriends_one: 'صديق مشترك واحد', mutualFriends_other: '{{count}} أصدقاء مشتركون', message: 'رسالة', addFriend: 'إضافة صديق', pending: 'تم إرسال الطلب', friends: 'أصدقاء', block: 'حظر', unblock: 'إلغاء الحظر', you: 'هذا أنت', copyId: 'نسخ معرّف المستخدم' },
  status: { online: 'متصل', idle: 'خامل', dnd: 'عدم الإزعاج', offline: 'غير متصل', invisible: 'مخفي', custom: 'اكتب حالة مخصصة' },
  mfa: { title: 'التحقق بخطوتين', sub: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.', code: 'الرمز', backupHint: 'فقدت هاتفك؟ أدخل أحد رموزك الاحتياطية (xxxx-xxxx).', verify: 'تحقّق', back: 'العودة إلى تسجيل الدخول' },
  forgot: { title: 'إعادة تعيين كلمة المرور', sub: 'سنرسل إليك رمزًا من 6 أرقام عبر البريد.', send: 'أرسل الرمز', codeSent: 'إن كان لهذا البريد حساب فالرمز في طريقه إليك.', code: 'الرمز من البريد', newPassword: 'كلمة المرور الجديدة', reset: 'إعادة التعيين' },
  badges: { dev: 'مطوّر mncord' },
  profileEdit: { title: 'الملفات الشخصية', displayName: 'الاسم المعروض', pronouns: 'الضمائر', pronounsHint: 'هو، هي…', avatar: 'الصورة الشخصية', changeAvatar: 'تغيير الصورة', banner: 'غلاف الملف الشخصي', changeBanner: 'رفع غلاف', remove: 'إزالة', color: 'لون الملف الشخصي', custom: 'لون مخصص', default: 'اللون الافتراضي', status: 'الحالة المخصصة', statusHint: 'ماذا تفعل الآن؟', about: 'نبذة عني', save: 'حفظ التغييرات', reset: 'إعادة', saved: 'تم الحفظ.', preview: 'معاينة' },
  titlebar: { back: 'رجوع', forward: 'تقدّم', inbox: 'البريد الوارد', mentions: 'الإشارات', noMentions: 'لا توجد إشارات بعد. عندما يذكرك أحد بـ@ ستظهر هنا.', help: 'مساعدة' },
  approvals: { group: 'المالك', title: 'الموافقات', sub: 'لا يستطيع أي حساب جديد استخدام mncord إلا بعد موافقتك عليه مرة واحدة. الرفض يوقف الحساب.', empty: 'لا يوجد أحد بالانتظار حاليًا.', approve: 'موافقة', decline: 'رفض', verified: 'البريد مؤكَّد', unverified: 'البريد غير مؤكَّد بعد' },
  gate: { verifyTitle: 'تحقّق من بريدك الإلكتروني', verifySub: 'أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى {{email}} لإكمال إنشاء حسابك.', spam: 'لم تصلك الرسالة؟ تحقّق من مجلد الرسائل غير المرغوب فيها، أو أرسل رمزًا جديدًا.', pendingTitle: 'بانتظار الموافقة', pendingSub: 'تم تأكيد بريدك الإلكتروني. يراجع مالك mncord كل حساب جديد، ويمكنك البدء فور الموافقة على حسابك. تتحقق هذه الصفحة تلقائيًا كل بضع ثوانٍ.', check: 'تحقّق الآن', stillWaiting: 'لم تتم الموافقة بعد. سنواصل التحقق.' },
  verifyEmail: { banner: 'يُرجى تأكيد بريدك الإلكتروني للحفاظ على أمان حسابك.', action: 'أكّد الآن', title: 'تأكيد البريد الإلكتروني', sub: 'أرسلنا رمزًا من 6 أرقام إلى {{email}}.', code: 'الرمز', confirm: 'تأكيد', resend: 'أرسل رمزًا جديدًا', resent: 'أُرسل رمز جديد.', done: 'تم تأكيد بريدك. شكرًا لك!' },
  settings: {
    title: 'الإعدادات', user: 'إعدادات المستخدم', app: 'إعدادات التطبيق', account: 'حسابي', security: 'الخصوصية والأمان', devices: 'الأجهزة', appearance: 'المظهر', language: 'اللغة', voice: 'الصوت', logout: 'تسجيل الخروج', close: 'إغلاق الإعدادات',
    changeAvatar: 'تغيير الصورة', profile: 'الملف الشخصي', displayName: 'الاسم الظاهر', bio: 'نبذة عني', pronouns: 'الضمائر', save: 'حفظ التغييرات', saved: 'تم الحفظ',
    username: 'اسم المستخدم', email: 'البريد الإلكتروني', edit: 'تعديل', changePassword: 'تغيير كلمة المرور', currentPassword: 'كلمة المرور الحالية', newPassword: 'كلمة المرور الجديدة', passwordChanged: 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى.',
    confirmPassword: 'أدخل كلمة المرور للمتابعة', verified: 'مؤكَّد', unverified: 'غير مؤكَّد',
    mfaTitle: 'التحقق بخطوتين', mfaOff: 'أضف خطوة ثانية لتسجيل الدخول. حتى لو عرف أحد كلمة مرورك فلن يدخل دون هاتفك.', mfaOn: 'التحقق بخطوتين مفعّل. متبقٍّ {{left}} من الرموز الاحتياطية.',
    enable2fa: 'تفعيل التحقق بخطوتين', disable2fa: 'إلغاء التحقق بخطوتين', regen: 'رموز احتياطية جديدة', scan: '1. امسح رمز QR هذا بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 2FAS أو Aegis).',
    manual: 'لا يمكنك المسح؟ اكتب هذا المفتاح:', enterCode: '2. أدخل الرمز المكوّن من 6 أرقام الظاهر في التطبيق', backupTitle: 'احفظ رموزك الاحتياطية', backupSub: 'كل رمز يعمل مرة واحدة إن فقدت هاتفك. لن تظهر مرة أخرى.', copyCodes: 'نسخ الرموز', done: 'تم', mfaCodeOrBackup: 'رمز التحقق أو رمز احتياطي',
    devicesSub: 'هذه الأجهزة مسجّلة الدخول إلى حسابك.', thisDevice: 'هذا الجهاز', lastActive: 'آخر نشاط {{when}}', signOutDevice: 'تسجيل الخروج', signOutAll: 'تسجيل الخروج من كل الأجهزة الأخرى', unknownDevice: 'جهاز غير معروف',
    deleteTitle: 'حذف الحساب', deleteSub: 'عند الحذف يُجدوَل حسابك للإزالة بعد 14 يومًا. سجّل الدخول قبلها لإلغاء الحذف.', deleteBtn: 'حذف الحساب', deleteConfirm: 'احذف حسابي',
    theme: 'السمة', midnight: 'منتصف الليل', light: 'فاتح', amoled: 'أسود AMOLED', density: 'كثافة الرسائل', cozy: 'مريح', compact: 'مضغوط', fontScale: 'حجم الخط', reducedMotion: 'تقليل الحركة', reducedMotionSub: 'إيقاف معظم الحركات.',
    languageSub: 'يتحدث mncord الإنجليزية والعربية الفصحى. العربية تحوّل التطبيق كله إلى اتجاه من اليمين إلى اليسار.',
    inputDevice: 'جهاز الإدخال', outputDevice: 'جهاز الإخراج', default: 'الافتراضي', suppression: 'عزل الضوضاء', ai: 'ذكاء اصطناعي (GTCRN)، الأقوى', rnnoise: 'RNNoise، خفيف', off: 'إيقاف', micTest: 'اختبار الميكروفون', micTestSub: 'تحدّث وراقب المؤشر. فعّل الاستماع لتسمع صوتك.', monitor: 'اسمع صوتي', stopTest: 'إيقاف الاختبار', startTest: 'ابدأ الاختبار',
  },
};

function initialLang(): 'en' | 'ar' {
  try {
    const saved = localStorage.getItem('mncord.lang');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* storage blocked */
  }
  return 'en'; // English by default; Arabic is one click away in Settings → Language
}

mergeInto(en as never, EN_EXTRA);
mergeInto(ar as never, AR_EXTRA);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes
});

export function applyLang(lang: 'en' | 'ar') {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  // the layout never flips: rail and sidebars stay on the left in both languages; only the words change
  document.documentElement.dir = 'ltr';
  try {
    localStorage.setItem('mncord.lang', lang);
  } catch {
    /* ignore */
  }
}
applyLang(i18n.language as 'en' | 'ar');

export const errorText = (code: string | undefined) => i18n.t(`errors.${code ?? 'unknown'}`, { defaultValue: i18n.t('errors.unknown') });
export default i18n;
