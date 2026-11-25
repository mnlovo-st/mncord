// "Playing …" like Discord: every 15 s the app looks at the names of running programs (just the .exe
// names, on this PC) and, if one is a known game or one you added, tells your friends what you're playing
// and since when. Turn it off in Settings → Activity Privacy.
import { send } from './gateway';
import { usePrefs } from './prefs';
import { get } from './store';

/** exe name (lower case) → game name. Add your own in Settings → Registered Games. */
export const KNOWN_GAMES: Record<string, string> = {
  'valorant-win64-shipping.exe': 'VALORANT',
  'league of legends.exe': 'League of Legends',
  'cs2.exe': 'Counter-Strike 2',
  'csgo.exe': 'Counter-Strike: Global Offensive',
  'r5apex.exe': 'Apex Legends',
  'r5apex_dx12.exe': 'Apex Legends',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'robloxplayerbeta.exe': 'Roblox',
  'minecraft.windows.exe': 'Minecraft',
  'minecraftlauncher.exe': 'Minecraft',
  'gta5.exe': 'Grand Theft Auto V',
  'gta5_enhanced.exe': 'Grand Theft Auto V',
  'rdr2.exe': 'Red Dead Redemption 2',
  'dota2.exe': 'Dota 2',
  'overwatch.exe': 'Overwatch 2',
  'rainbowsix.exe': 'Rainbow Six Siege',
  'rainbowsix_vulkan.exe': 'Rainbow Six Siege',
  'rainbowsix_be.exe': 'Rainbow Six Siege',
  'cod.exe': 'Call of Duty',
  'blackops6.exe': 'Call of Duty: Black Ops 6',
  'rocketleague.exe': 'Rocket League',
  'fc24.exe': 'EA SPORTS FC 24',
  'fc25.exe': 'EA SPORTS FC 25',
  'fc26.exe': 'EA SPORTS FC 26',
  'efootball.exe': 'eFootball',
  'eldenring.exe': 'ELDEN RING',
  'palworld-win64-shipping.exe': 'Palworld',
  'rustclient.exe': 'Rust',
  'terraria.exe': 'Terraria',
  'among us.exe': 'Among Us',
  'tslgame.exe': 'PUBG: BATTLEGROUNDS',
  'deadbydaylight-win64-shipping.exe': 'Dead by Daylight',
  'witcher3.exe': 'The Witcher 3',
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'helldivers2.exe': 'HELLDIVERS 2',
  'marvel-win64-shipping.exe': 'Marvel Rivals',
  'discovery.exe': 'THE FINALS',
  'destiny2.exe': 'Destiny 2',
  'warframe.x64.exe': 'Warframe',
  'genshinimpact.exe': 'Genshin Impact',
  'starrail.exe': 'Honkai: Star Rail',
  'zenlesszonezero.exe': 'Zenless Zone Zero',
  'pathofexile_x64.exe': 'Path of Exile',
  'pathofexile_x64steam.exe': 'Path of Exile',
  'pathofexile.exe': 'Path of Exile',
  'diablo iv.exe': 'Diablo IV',
  'wow.exe': 'World of Warcraft',
  'hearthstone.exe': 'Hearthstone',
  'arkascended.exe': 'ARK: Survival Ascended',
  'shootergame.exe': 'ARK: Survival Evolved',
  'valheim.exe': 'Valheim',
  'sonsoftheforest.exe': 'Sons Of The Forest',
  'phasmophobia.exe': 'Phasmophobia',
  'lethal company.exe': 'Lethal Company',
  'repo.exe': 'R.E.P.O.',
  'peak.exe': 'PEAK',
  'fallguys_client_game.exe': 'Fall Guys',
  'brawlhalla.exe': 'Brawlhalla',
  'tf_win64.exe': 'Team Fortress 2',
  'stardew valley.exe': 'Stardew Valley',
  'left4dead2.exe': 'Left 4 Dead 2',
  'fsd-win64-shipping.exe': 'Deep Rock Galactic',
  'sotgame.exe': 'Sea of Thieves',
  'forzahorizon5.exe': 'Forza Horizon 5',
  'forzahorizon4.exe': 'Forza Horizon 4',
  'nba2k25.exe': 'NBA 2K25',
  'nba2k26.exe': 'NBA 2K26',
  'mk12.exe': 'Mortal Kombat 1',
  'polaris-win64-shipping.exe': 'TEKKEN 8',
  'streetfighter6.exe': 'Street Fighter 6',
  'monsterhunterwilds.exe': 'Monster Hunter Wilds',
  'monsterhunterworld.exe': 'Monster Hunter: World',
  'factorio.exe': 'Factorio',
  'cities2.exe': 'Cities: Skylines II',
  'civilizationvi.exe': 'Sid Meier\'s Civilization VI',
  'hoi4.exe': 'Hearts of Iron IV',
  'eu4.exe': 'Europa Universalis IV',
  'osu!.exe': 'osu!',
  'geometrydash.exe': 'Geometry Dash',
  'aces.exe': 'War Thunder',
  'worldoftanks.exe': 'World of Tanks',
  'escapefromtarkov.exe': 'Escape from Tarkov',
  'squadgame.exe': 'Squad',
  'huntgame.exe': 'Hunt: Showdown',
  'lostark.exe': 'Lost Ark',
  'newworld.exe': 'New World',
  'haloinfinite.exe': 'Halo Infinite',
  'hogwartslegacy.exe': 'Hogwarts Legacy',
  'starfield.exe': 'Starfield',
  'skyrimse.exe': 'The Elder Scrolls V: Skyrim',
  'fallout4.exe': 'Fallout 4',
  'sekiro.exe': 'Sekiro: Shadows Die Twice',
  'darksoulsiii.exe': 'DARK SOULS III',
  'armoredcore6.exe': 'ARMORED CORE VI',
  'theforest.exe': 'The Forest',
  '7daystodie.exe': '7 Days to Die',
  'dayz_x64.exe': 'DayZ',
  'projectzomboid64.exe': 'Project Zomboid',
  'rimworldwin64.exe': 'RimWorld',
  'subnautica.exe': 'Subnautica',
  'nms.exe': "No Man's Sky",
  'crossfire.exe': 'CrossFire',
  'pointblank.exe': 'Point Blank',
  'hd-player.exe': 'BlueStacks',
  'gameloop.exe': 'GameLoop',
  'blackdesert64.exe': 'Black Desert',
  'smite2.exe': 'SMITE 2',
  'deltaforceclient-win64-shipping.exe': 'Delta Force',
  'thronefall.exe': 'Thronefall',
  'battlefield6.exe': 'Battlefield 6',
  'bf2042.exe': 'Battlefield 2042',
  'bfv.exe': 'Battlefield V',
  'mw2.exe': 'Call of Duty: Modern Warfare II',
  'farcry6.exe': 'Far Cry 6',
  'acvalhalla.exe': "Assassin's Creed Valhalla",
  'acshadows.exe': "Assassin's Creed Shadows",
  'spider-man.exe': "Marvel's Spider-Man",
  'gow.exe': 'God of War',
  'gowr.exe': 'God of War Ragnarök',
  'tlou-i.exe': 'The Last of Us Part I',
  'stalker2-win64-shipping.exe': 'S.T.A.L.K.E.R. 2',
  'b1-win64-shipping.exe': 'Black Myth: Wukong',
};

let current: { exe: string; name: string; startedAt: number } | null = null;
let sent: string | null | undefined;

function lookup(names: string[]) {
  const p = usePrefs.getState();
  const custom = Object.fromEntries(Object.entries(p.customGames).map(([k, v]) => [k.toLowerCase(), v]));
  for (const exe of names) {
    if (p.hiddenGames.includes(exe)) continue;
    const name = custom[exe] ?? KNOWN_GAMES[exe];
    if (name) return { exe, name };
  }
  return null;
}

export function currentGame() {
  return current;
}

function publish(force = false) {
  const share = usePrefs.getState().shareActivity;
  const key = share && current ? current.name : null;
  if (!force && key === sent) return;
  sent = key;
  if (get().connection !== 'ready') {
    sent = undefined; // try again once connected
    return;
  }
  send({ op: 'activity', activity: share && current ? { name: current.name, startedAt: current.startedAt } : null });
}

async function scan() {
  if (!window.mncord?.games) return;
  const names = await window.mncord.games.running().catch(() => [] as string[]);
  const hit = lookup(names);
  if (!hit) current = null;
  else if (!current || current.exe !== hit.exe) current = { ...hit, startedAt: Date.now() };
  else current.name = hit.name; // renamed in settings
  publish();
}

let started = false;
export function startActivityWatcher() {
  if (started) return;
  started = true;
  void scan();
  setInterval(() => void scan(), 15_000);
  usePrefs.subscribe((s, prev) => {
    if (s.shareActivity !== prev.shareActivity || s.customGames !== prev.customGames || s.hiddenGames !== prev.hiddenGames) void scan().then(() => publish(true));
  });
}
/** after (re)connecting the server forgot it: send again */
export function resendActivity() {
  sent = undefined;
  publish(true);
}
