import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Compass, Gift, Hash, Inbox, Pin, PlusCircle, Plus, Search, Smile, Sticker, Users } from 'lucide-react';
import { DirectionProvider } from '@radix-ui/react-direction';
import logo from '../assets/logo-wordmark.webp';
import mark from '../assets/mark-m.webp';
import { Avatar } from '../ui/Avatar';
import { MentionBadge, RolePill, Tag } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ChannelCategory, ChannelItem } from '../ui/ChannelItem';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuCheckbox, MenuItem, MenuSeparator, MenuSlot, MenuSub } from '../ui/ContextMenu';
import { GuildIcon } from '../ui/GuildIcon';
import { Input } from '../ui/Input';
import { Message, TypingIndicator } from '../ui/Message';
import { Modal } from '../ui/Modal';
import { Slider } from '../ui/Slider';
import { Switch } from '../ui/Switch';
import { NoticeBar, Toast } from '../ui/Toast';
import { Tooltip, TooltipProvider } from '../ui/Tooltip';
import { UserPanel, VoiceConnectedPanel, VoiceTile, VoiceUser } from '../ui/Voice';
import { cn } from '../ui/cn';
import { strings, type Lang, type Strings } from './strings';

type Theme = 'midnight' | 'light' | 'amoled';

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-sm bg-surface-input p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('h-7 rounded-xs px-3 text-sm font-medium transition-colors', value === v ? 'bg-surface-selected text-text' : 'text-muted hover:text-text')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-2xs font-bold uppercase tracking-wide text-faint">{title}</h2>
      {children}
    </section>
  );
}

function Shell({ t }: { t: Strings }) {
  const [muted, setMuted] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [sel, setSel] = useState('general');
  const [catOpen, setCatOpen] = useState(true);
  return (
    <div className="flex h-[640px] overflow-hidden rounded-lg border border-border shadow-card">
      {/* Guild rail */}
      <nav aria-label="Servers" className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-bg-deep py-3">
        <GuildIcon name={t.home} src={mark} />
        <div className="h-0.5 w-8 rounded-full bg-border" />
        <GuildIcon name={t.server} selected>mn</GuildIcon>
        <GuildIcon name="Abu Dhabi Gamers" unread mentions={3} />
        <GuildIcon name="Design Lab" />
        <GuildIcon name="Valorant UAE" unread />
        <GuildIcon name={t.addServer} tone="action"><Plus className="size-6" /></GuildIcon>
        <GuildIcon name={t.discover} tone="action"><Compass className="size-6" /></GuildIcon>
      </nav>

      {/* Channel sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-surface">
        <button type="button" className="flex h-12 items-center justify-between border-b border-border px-4 font-display text-base font-semibold hover:bg-surface-hover">
          {t.server}
        </button>
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          <ChannelCategory name={t.catText} collapsed={!catOpen} onToggle={() => setCatOpen((o) => !o)}>
            <ChannelItem type="announcement" name={t.announcements} pinned unread />
            <ChannelItem type="text" name={t.general} selected={sel === 'general'} onClick={() => setSel('general')} />
            <ChannelItem type="text" name={t.clips} mentions={2} unread onClick={() => setSel('clips')} selected={sel === 'clips'} />
            <ChannelItem type="forum" name={t.forum} muted />
            <ChannelItem type="text" name="staff" locked />
          </ChannelCategory>
          <ChannelCategory name={t.catVoice}>
            <ChannelItem type="voice" name={t.lounge}>
              <VoiceUser name="mnlovo" speaking self />
              <VoiceUser name="Noor" muted />
            </ChannelItem>
            <ChannelItem type="voice" name={t.gaming}>
              <VoiceUser name="Hamad" live speaking />
            </ChannelItem>
          </ChannelCategory>
        </ul>
        <VoiceConnectedPanel channel={`${t.lounge} / ${t.server}`} labels={{ connected: t.connected, disconnect: t.disconnect, camera: t.camera, cameraOff: t.camera, screen: t.screen, noise: t.noise, ping: t.ping }} />
        <UserPanel
          name="mnlovo"
          tag="@mnlovo"
          status="online"
          muted={muted}
          deafened={deaf}
          onMute={() => setMuted((m) => !m)}
          onDeafen={() => setDeaf((d) => !d)}
          labels={{ mute: t.mute, unmute: t.unmute, deafen: t.deafen, undeafen: t.undeafen, settings: t.settings, status: t.status, inputOptions: 'Input', outputOptions: 'Output' }}
        />
      </aside>

      {/* Chat */}
      <main className="flex min-w-0 flex-1 flex-col bg-bg">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 shadow-low">
          <Hash aria-hidden className="size-6 text-faint" />
          <h1 className="font-semibold">{t.general}</h1>
          <span className="mx-2 h-6 w-px bg-border" />
          <p className="truncate text-sm text-muted">{t.topic}</p>
          <div className="ms-auto flex items-center gap-3 text-muted">
            <Tooltip content={t.notif} side="bottom"><Bell className="size-5" /></Tooltip>
            <Tooltip content="Pins" side="bottom"><Pin className="size-5" /></Tooltip>
            <Tooltip content={t.showMembers} side="bottom"><Users className="size-5 text-text" /></Tooltip>
            <div className="flex h-6 w-36 items-center rounded-xs bg-bg-deep px-1.5 text-sm text-faint">{t.search}<Search className="ms-auto size-4" /></div>
            <Inbox className="size-5" />
          </div>
        </header>
        <div role="log" className="flex-1 overflow-y-auto pb-4">
          <Message author="mnlovo" authorColor="var(--c-accent-text)" time="Today 9:41 PM" reactions={[{ emoji: '🔥', count: 12, me: true }, { emoji: '❤️', count: 5 }]} labels={{ failed: t.failed, edited: t.edited, toolbar: t.more }}>{t.msg1}</Message>
          <Message author="Hamad" authorColor="#7fb2ff" time="Today 9:43 PM" labels={{ failed: t.failed, edited: t.edited, toolbar: t.more }}>{t.msg2}</Message>
          <Message author="Hamad" grouped time="Today 9:43 PM" edited labels={{ failed: t.failed, edited: t.edited, toolbar: t.more }}>Mixed: Arabic مرحبا and English in one line.</Message>
          <Message author="Sara" time="Today 9:45 PM" reply={{ author: 'Hamad', text: t.msg2 }} labels={{ failed: t.failed, edited: t.edited, toolbar: t.more }}>{t.msg3}</Message>
          <Message author="Sara" grouped highlighted time="Today 9:46 PM" labels={{ failed: t.failed, edited: t.edited, toolbar: t.more }}>
            <span className="rounded-xs bg-accent/25 px-0.5 font-medium text-accent-text">@mnlovo</span> {t.msg4.replace('@Noor ', '')}
          </Message>
          <Message author="mnlovo" time="Today 9:47 PM" state="failed" labels={{ failed: t.failed, edited: t.edited, toolbar: t.more }}>{t.msgFailed}</Message>
        </div>
        <div className="px-4 pb-1">
          <div className="flex min-h-11 items-center gap-3 rounded-md bg-surface-raised px-4 text-muted">
            <PlusCircle aria-hidden className="size-6" />
            <span className="flex-1 text-faint">{t.composer}</span>
            <Gift aria-hidden className="size-6" /><Sticker aria-hidden className="size-6" /><Smile aria-hidden className="size-6" />
          </div>
          <TypingIndicator text={t.typing} />
        </div>
      </main>

      {/* Members */}
      <aside aria-label="Members" className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto bg-surface px-2 py-4 xl:flex">
        <h3 className="px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t.admins} — 1</h3>
        <MemberRow name="mnlovo" status="online" color="var(--c-accent-text)" activity="mncord" />
        <h3 className="mt-4 px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t.online} — 3</h3>
        <MemberRow name="Hamad" status="streaming" color="#7fb2ff" activity="4K 120" />
        <MemberRow name="Sara" status="idle" />
        <MemberRow name="Noor" status="dnd" />
        <h3 className="mt-4 px-2 text-2xs font-bold uppercase tracking-wide text-faint">{t.offline} — 2</h3>
        <MemberRow name="Khalid" status="offline" dim />
        <MemberRow name="Mariam" status="offline" dim />
      </aside>
    </div>
  );
}

function MemberRow({ name, status, color, activity, dim }: { name: string; status: 'online' | 'idle' | 'dnd' | 'offline' | 'streaming'; color?: string; activity?: string; dim?: boolean }) {
  return (
    <button type="button" className={cn('flex h-11 items-center gap-3 rounded-sm px-2 text-start hover:bg-surface-hover', dim && 'opacity-40 hover:opacity-100')}>
      <Avatar name={name} size={32} status={status} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-base font-medium" style={{ color: color ?? 'var(--c-text-muted)' }}>{name}</span>
        {activity && <span className="block truncate text-xs text-muted">{activity}</span>}
      </span>
    </button>
  );
}

export function DesignPage() {
  const [theme, setTheme] = useState<Theme>('midnight');
  const [lang, setLang] = useState<Lang>('en');
  const [noiseAi, setNoiseAi] = useState(true);
  const [echo, setEcho] = useState(true);
  const [agc, setAgc] = useState(false);
  const [sens, setSens] = useState(-48);
  const [vol, setVol] = useState(100);
  const [strength, setStrength] = useState(80);
  const [level, setLevel] = useState(30);
  const [modal, setModal] = useState(false);
  const [menuMuted, setMenuMuted] = useState(false);
  const [user, setUser] = useState('mnlovo');
  const [q, setQ] = useState('4K');
  const t = strings[lang];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [theme, lang]);

  // fake mic level for the sensitivity meter
  useEffect(() => {
    const id = setInterval(() => setLevel(20 + Math.random() * 55), 120);
    return () => clearInterval(id);
  }, []);

  return (
    <DirectionProvider dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <TooltipProvider>
      <div className="min-h-full bg-bg-deep">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b border-border bg-bg-deep/90 px-6 py-3 backdrop-blur">
          <img src={logo} alt="mnlovo" className="h-7 w-auto" style={{ filter: theme === 'light' ? 'invert(1) hue-rotate(180deg)' : undefined }} />
          <span className="font-display text-lg font-semibold">mncord · {t.title}</span>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <Segmented label={t.theme} value={theme} onChange={setTheme} options={[['midnight', t.midnight], ['light', t.light], ['amoled', t.amoled]]} />
            <Segmented label={t.language} value={lang} onChange={setLang} options={[['en', 'English'], ['ar', 'العربية']]} />
          </div>
        </header>

        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
          <NoticeBar tone="warning" action={<Button size="sm" variant="secondary" className="h-6">{t.resend}</Button>}>{t.notice}</NoticeBar>

          <Section title={t.shell}><Shell t={t} /></Section>

          <h2 className="font-display text-xl font-bold">{t.primitives}</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t.buttons}>
              <div className="flex flex-wrap items-center gap-3">
                <Button>{t.primary}</Button>
                <Button variant="secondary">{t.secondary}</Button>
                <Button variant="ghost">{t.ghost}</Button>
                <Button variant="danger">{t.danger}</Button>
                <Button variant="success">{t.success}</Button>
                <Button loading>{t.loading}</Button>
                <Button disabled>{t.primary}</Button>
                <Button variant="link">{t.link}</Button>
                <Button size="sm">{t.primary}</Button>
                <Button size="lg">{t.primary}</Button>
              </div>
            </Section>

            <Section title={t.inputs}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={t.email} type="email" placeholder="you@example.com" autoComplete="email" />
                <Input label={t.password} variant="password" defaultValue="hunter2hunter2" />
                <Input label={t.username} value={user} onChange={(e) => setUser(e.target.value)} error={user === 'mnlovo' ? t.usernameTaken : undefined} />
                <Input label={t.search} variant="search" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} hint={t.hint} />
              </div>
            </Section>

            <Section title={t.controls}>
              <div className="flex flex-col gap-5">
                <Switch label={t.noiseAi} description={t.noiseAiDesc} checked={noiseAi} onCheckedChange={setNoiseAi} />
                <Slider label={t.strength} value={strength} onValueChange={setStrength} format={(v) => `${v}%`} />
                <Switch label={t.echo} checked={echo} onCheckedChange={setEcho} />
                <Switch label={t.agc} checked={agc} onCheckedChange={setAgc} disabled />
                <Slider label={t.sensitivity} value={sens} onValueChange={setSens} min={-100} max={0} format={(v) => `${v} dB`} level={level} />
                <Slider label={t.userVolume} value={vol} onValueChange={setVol} min={0} max={400} format={(v) => `${v}%`} />
              </div>
            </Section>

            <Section title={t.feedback}>
              <div className="flex flex-col gap-3">
                <Toast tone="success" title={t.toastOk} onClose={() => {}} />
                <Toast tone="error" title={t.toastErr} body={t.toastErrBody} />
                <Toast tone="info" title={t.toastInfo} body={t.toastInfoBody} action={<Button size="sm">{t.restart}</Button>} onClose={() => {}} />
              </div>
            </Section>

            <Section title={t.overlays}>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="secondary" onClick={() => setModal(true)}>{t.openModal}</Button>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="grid h-24 flex-1 place-items-center rounded-md border-2 border-dashed border-border-input text-sm text-muted">{t.rightClick}</div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <MenuItem>{t.markRead}</MenuItem>
                    <MenuSeparator />
                    <MenuCheckbox checked={menuMuted} onCheckedChange={setMenuMuted}>{t.mutCh}</MenuCheckbox>
                    <MenuSub label={t.notif}>
                      <MenuItem>All messages</MenuItem>
                      <MenuItem>Only @mentions</MenuItem>
                      <MenuItem>Nothing</MenuItem>
                    </MenuSub>
                    <MenuSlot>
                      <Slider label={t.userVolume} value={vol} onValueChange={setVol} min={0} max={400} format={(v) => `${v}%`} />
                    </MenuSlot>
                    <MenuSeparator />
                    <MenuItem shortcut="Ctrl+C">{t.copyLink}</MenuItem>
                    <MenuItem danger>{t.deleteCh}</MenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
              <Modal
                open={modal}
                onOpenChange={setModal}
                title={t.modalTitle}
                description={t.modalBody}
                footer={<><Button variant="ghost" onClick={() => setModal(false)}>{t.secondary}</Button><Button variant="danger" onClick={() => setModal(false)}>{t.danger}</Button></>}
              />
            </Section>

            <Section title={t.badges}>
              <div className="flex flex-wrap items-center gap-3">
                <MentionBadge count={3} /><MentionBadge count={128} />
                <Tag>Bot</Tag><Tag tone="accent">New</Tag><Tag tone="live">Live</Tag>
                <RolePill name={t.roleMod} color="#7fb2ff" /><RolePill name={t.roleArt} color="#f4b740" />
                {(['online', 'idle', 'dnd', 'offline', 'streaming'] as const).map((s) => <Avatar key={s} name={s} size={40} status={s} />)}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <VoiceTile name="mnlovo" speaking self />
                <VoiceTile name="Noor" muted />
                <VoiceTile name="Hamad" stream quality="4K 120" watchLabel={t.watch} />
              </div>
            </Section>
          </div>

          <p className="text-center text-xs text-faint">{t.tokensNote} · © mnlovo</p>
        </div>
      </div>
    </TooltipProvider>
    </DirectionProvider>
  );
}
