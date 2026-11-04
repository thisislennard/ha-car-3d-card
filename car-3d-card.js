/*!
 * Car 3D Card for Home Assistant
 * https://github.com/thisislennard/ha-car-3d-card
 * MIT License
 *
 * Shows your car as an interactive 3D model (drag to rotate, pinch/scroll to zoom) with live
 * status: open doors / windows / trunk / hood / charge port as pulsing red markers, warnings
 * (tire pressure, brake fluid, washer fluid) as orange markers, plus lock, battery, range,
 * charging, climate and defrost chips. Works with your own GLB model or a built-in demo car.
 */
const CARD_VERSION = '1.2.0';
const THREE_VERSION = '0.170.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

/* ------------------------------------------------------------------ */
/*  Parts with markers. Positions are RELATIVE to the model size:      */
/*  x: -1 (right side) … +1 (left side), y: 0 (ground) … 1 (roof),     */
/*  z: -1 (rear) … +1 (front). Override per part with `markers:`.      */
/* ------------------------------------------------------------------ */
const PARTS = [
  { key: 'front_left_door',   kia: 'binary_sensor.{p}_front_left_door',   pos: [0.96, 0.50, 0.15] },
  { key: 'front_right_door',  kia: 'binary_sensor.{p}_front_right_door',  pos: [-0.96, 0.50, 0.15] },
  { key: 'rear_left_door',    kia: 'binary_sensor.{p}_back_left_door',    pos: [0.96, 0.50, -0.30] },
  { key: 'rear_right_door',   kia: 'binary_sensor.{p}_back_right_door',   pos: [-0.96, 0.50, -0.30] },
  { key: 'front_left_window', kia: 'binary_sensor.{p}_front_left_window', pos: [0.79, 0.78, 0.13] },
  { key: 'front_right_window',kia: 'binary_sensor.{p}_front_right_window',pos: [-0.79, 0.78, 0.13] },
  { key: 'rear_left_window',  kia: 'binary_sensor.{p}_back_left_window',  pos: [0.79, 0.78, -0.28] },
  { key: 'rear_right_window', kia: 'binary_sensor.{p}_back_right_window', pos: [-0.79, 0.78, -0.28] },
  { key: 'sunroof',           kia: 'binary_sensor.{p}_sunroof',           pos: [0, 0.99, 0.0] },
  { key: 'trunk',             kia: 'binary_sensor.{p}_trunk',             pos: [0, 0.69, -1.02] },
  { key: 'hood',              kia: 'binary_sensor.{p}_hood',              pos: [0, 0.60, 0.70] },
  { key: 'charge_port',       kia: 'binary_sensor.{p}_ev_charge_port',    pos: [-0.92, 0.58, -0.66] },
  // warnings (orange, own text instead of "open")
  { key: 'tire_front_left',   kia: 'binary_sensor.{p}_tire_pressure_front_left',  pos: [0.85, 0.24, 0.60],  warn: true },
  { key: 'tire_front_right',  kia: 'binary_sensor.{p}_tire_pressure_front_right', pos: [-0.85, 0.24, 0.60], warn: true },
  { key: 'tire_rear_left',    kia: 'binary_sensor.{p}_tire_pressure_rear_left',   pos: [0.85, 0.24, -0.64], warn: true },
  { key: 'tire_rear_right',   kia: 'binary_sensor.{p}_tire_pressure_rear_right',  pos: [-0.85, 0.24, -0.64], warn: true },
  { key: 'brake_fluid',       kia: 'binary_sensor.{p}_brake_fluid_warning',       pos: [0.39, 0.61, 0.58],  warn: true },
  { key: 'washer_fluid',      kia: 'binary_sensor.{p}_washer_fluid_warning',      pos: [-0.39, 0.61, 0.75], warn: true },
];

/* Demo / show mode: display-only overrides, nothing is written to Home Assistant. */
const SHOW_SCENES = [
  { lock: 'locked' },
  { front_left_door: 'on', lock: 'unlocked' },
  { rear_left_door: 'on', rear_right_door: 'on', lock: 'unlocked' },
  { trunk: 'on', lock: 'unlocked' },
  { front_right_window: 'on', front_left_window: 'on' },
  { tire_front_left: 'on', tire_rear_right: 'on' },
  { washer_fluid: 'on', brake_fluid: 'on' },
  { charge_port: 'on', plug: 'on', charging: 'on' },
  { climate: 'on', defrost: 'on', rear_defrost: 'on' },
  { hood: 'on', lock: 'unlocked' },
];

/* Status entities (chips below the model). */
const STATUS = {
  lock:         'lock.{p}_door_lock',
  battery:      'sensor.{p}_ev_battery_level',
  range:        'sensor.{p}_ev_range',
  fuel_level:   'sensor.{p}_fuel_level',
  fuel_range:   'sensor.{p}_fuel_driving_range',
  plug:         'binary_sensor.{p}_ev_battery_plug',
  charging:     'binary_sensor.{p}_ev_battery_charge',
  climate:      'binary_sensor.{p}_air_conditioner',
  defrost:      'binary_sensor.{p}_defrost',
  rear_defrost: 'binary_sensor.{p}_back_window_heater',
  updated:      'sensor.{p}_last_updated_at',
  refresh:      'button.{p}_force_refresh',
};

const I18N = {
  en: {
    open: 'open', loading: 'Loading 3D model …', failed: '3D model could not be loaded: ',
    hint: 'Drag to rotate · pinch / scroll to zoom', bg: 'Change background',
    allClosed: 'All doors, windows and flaps closed', openList: 'Open: ', okWarn: 'Tires, brakes & washer fluid OK',
    locked: 'Locked', unlocked: 'Unlocked', charging: 'Charging', plugged: 'Plugged in', climate: 'Climate on',
    defrost: 'Windshield heating', rearDefrost: 'Rear window heating', refresh: 'Refresh now', refreshing: 'Refreshing …',
    confirm: 'Wake up the car and request fresh data? (uses a little 12 V battery)', updated: 'Updated: ',
    demo: 'Demo car – set `model:` to use your own 3D model',
    showStart: 'Start demo', showStop: 'Stop demo', showNote: 'Demo – simulated, no real data is changed',
    scenes: ['Everything closed & locked', 'Driver door open', 'Rear doors open', 'Trunk open', 'Window open',
      'Tire pressure low', 'Washer & brake fluid', 'Charging', 'Climate & defrost', 'Hood open'],
    names: {
      front_left_door: 'Front left door', front_right_door: 'Front right door', rear_left_door: 'Rear left door',
      rear_right_door: 'Rear right door', front_left_window: 'Front left window', front_right_window: 'Front right window',
      rear_left_window: 'Rear left window', rear_right_window: 'Rear right window', sunroof: 'Sunroof', trunk: 'Trunk',
      hood: 'Hood', charge_port: 'Charge port', tire_front_left: 'Tire pressure front left',
      tire_front_right: 'Tire pressure front right', tire_rear_left: 'Tire pressure rear left',
      tire_rear_right: 'Tire pressure rear right', brake_fluid: 'Check brake fluid', washer_fluid: 'Refill washer fluid',
    },
    themes: { studio: 'Showroom dark', light: 'Showroom light', night: 'Night' },
  },
  de: {
    open: 'offen', loading: '3D-Modell wird geladen …', failed: '3D-Modell konnte nicht geladen werden: ',
    hint: 'Ziehen zum Drehen · Zwei Finger / Mausrad zum Zoomen', bg: 'Hintergrund wechseln',
    allClosed: 'Alle Türen, Fenster und Klappen geschlossen', openList: 'Offen: ', okWarn: 'Reifen, Bremse & Wischwasser OK',
    locked: 'Verriegelt', unlocked: 'Entriegelt', charging: 'Lädt', plugged: 'Kabel steckt', climate: 'Klima an',
    defrost: 'Frontscheibe heizt', rearDefrost: 'Heckscheibe heizt', refresh: 'Jetzt aktualisieren', refreshing: 'Wird abgefragt …',
    confirm: 'Das Auto jetzt aufwecken und Daten abfragen? (kostet etwas 12-V-Batterie)', updated: 'Stand: ',
    demo: 'Demo-Auto – mit `model:` dein eigenes 3D-Modell einbinden',
    showStart: 'Vorführung starten', showStop: 'Vorführung stoppen', showNote: 'Vorführung – simuliert, echte Werte bleiben unverändert',
    scenes: ['Alles zu & verriegelt', 'Fahrertür offen', 'Hintere Türen offen', 'Kofferraum offen', 'Fenster offen',
      'Reifendruck zu niedrig', 'Wischwasser & Bremsflüssigkeit', 'Laden', 'Klima & Scheibenheizung', 'Motorhaube offen'],
    names: {
      front_left_door: 'Tür vorne links', front_right_door: 'Tür vorne rechts', rear_left_door: 'Tür hinten links',
      rear_right_door: 'Tür hinten rechts', front_left_window: 'Fenster vorne links', front_right_window: 'Fenster vorne rechts',
      rear_left_window: 'Fenster hinten links', rear_right_window: 'Fenster hinten rechts', sunroof: 'Schiebedach', trunk: 'Kofferraum',
      hood: 'Motorhaube', charge_port: 'Ladeklappe', tire_front_left: 'Reifendruck vorne links',
      tire_front_right: 'Reifendruck vorne rechts', tire_rear_left: 'Reifendruck hinten links',
      tire_rear_right: 'Reifendruck hinten rechts', brake_fluid: 'Bremsflüssigkeit prüfen', washer_fluid: 'Wischwasser auffüllen',
    },
    themes: { studio: 'Showroom dunkel', light: 'Showroom hell', night: 'Nacht' },
  },
};

/* Backgrounds – switchable with the palette button, remembered per browser. */
const THEMES = {
  studio: { css: 'radial-gradient(ellipse 80% 70% at 50% 30%, #4a5059 0%, #1c1f24 55%, #0a0b0d 100%)',
            floor: '#2c3037', refl: 0.6, text: '#fff', sub: 'rgba(255,255,255,.7)', sun: 1.4, spot: 1.1, rim: 0, ring: false, exp: 1.05 },
  light:  { css: 'radial-gradient(ellipse 80% 70% at 50% 30%, #ffffff 0%, #e6e9ed 55%, #c3c9d0 100%)',
            floor: '#e3e6ea', refl: 0.78, text: '#1b1d20', sub: 'rgba(0,0,0,.55)', sun: 1.5, spot: 0.6, rim: 0, ring: false, exp: 1.0 },
  night:  { css: 'radial-gradient(ellipse 90% 70% at 50% 25%, #1d2d52 0%, #0b1226 55%, #03050c 100%)',
            floor: '#121c38', refl: 0.55, text: '#fff', sub: 'rgba(200,220,255,.75)', sun: 0.7, spot: 0.9, rim: 3.0, ring: true, exp: 1.1 },
};
const THEME_ALIAS = { hell: 'light', dunkel: 'studio', dark: 'studio', nacht: 'night' };
const THEME_KEYS = Object.keys(THEMES);

/* Optional material overrides by material name (used by the demo car and by models whose
   materials are named like this). Other materials of your model are kept as they are. */
const MATS = (T, paint, env) => ({
  paint:      () => new T.MeshPhysicalMaterial({ color: paint, metalness: 0.3, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 1.25 }),
  // glass: unlit + environment reflection only (lit glass showed a bright blob from the studio lamps)
  glass:      () => new T.MeshBasicMaterial({ color: 0x07090c, envMap: env || null, reflectivity: 0.32, combine: T.MixOperation, transparent: true, opacity: 0.88 }),
  tire:       () => new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.82 }),
  rim:        () => new T.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.9, roughness: 0.32 }),
  rim_face:   () => new T.MeshStandardMaterial({ color: 0xb4b8bd, metalness: 1, roughness: 0.22 }),
  brake:      () => new T.MeshStandardMaterial({ color: 0x55575a, metalness: 0.9, roughness: 0.5, side: T.DoubleSide }),
  caliper:    () => new T.MeshPhysicalMaterial({ color: 0xb8e600, roughness: 0.35, clearcoat: 0.6, side: T.DoubleSide }),
  interior:   () => new T.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.85, side: T.DoubleSide }),
  trim:       () => new T.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.6, metalness: 0.1 }),
  trim_gloss: () => new T.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
  chrome:     () => new T.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.08 }),
  taillight:  () => new T.MeshPhysicalMaterial({ color: 0x8a0a0a, emissive: 0xff1208, emissiveIntensity: 2.2, roughness: 0.1, clearcoat: 1 }),
  headlight:  () => new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }),  // clear lens
  drl:        () => new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f7ff, emissiveIntensity: 4 }),
});

/* Studio environment for reflections: dark room with soft boxes and light strips
   (gives the paint those long "showroom" highlights). */
function studioEnv(T) {
  const sc = new T.Scene();
  sc.add(new T.Mesh(new T.BoxGeometry(30, 14, 30), new T.MeshBasicMaterial({ color: 0x2b2e34, side: T.BackSide })));
  const light = (w, h, x, y, z, i, ry = 0, rx = 0) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(i, i, i), side: T.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.lookAt(0, y > 5 ? 0 : y, 0); sc.add(m);
  };
  light(10, 4, 0, 6.8, 0, 4.5);                 // overhead soft box
  light(1.2, 9, -9, 3.5, 4, 5); light(1.2, 9, 9, 3.5, -4, 5);   // vertical strips
  light(14, 0.6, 0, 2.2, -12, 4); light(14, 0.6, 0, 2.2, 12, 4); // horizon lines front/back
  light(6, 3, 10, 4, 8, 1.6); light(6, 3, -10, 4, -8, 1.2);     // fill
  const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshBasicMaterial({ color: 0x0b0c0e }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; sc.add(floor);
  return sc;
}

/* Built-in demo car (simple crossover) – used when no `model:` is configured. */
function buildDemoCar(T) {
  const g = new T.Group();
  const mat = (name) => { const m = new T.MeshStandardMaterial(); m.name = name; return m; };
  // path: ['m',z,y] move, ['l',z,y] line, ['q',cz,cy,z,y] curve – side profile, front = +z
  const extrude = (path, width, bevel, name) => {
    const s = new T.Shape();
    for (const [op, ...a] of path) {
      if (op === 'm') s.moveTo(a[0], a[1]); else if (op === 'l') s.lineTo(a[0], a[1]);
      else if (op === 'a') s.absarc(a[0], a[1], a[2], Math.PI, 0, true);  // wheel arch, centre z/y, radius
      else s.quadraticCurveTo(a[0], a[1], a[2], a[3]);
    }
    const geo = new T.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 6, curveSegments: 16 });
    geo.translate(0, 0, -width / 2); geo.rotateY(-Math.PI / 2);
    return new T.Mesh(geo, mat(name));
  };
  g.add(extrude([['m', -2.2, 0.3], ['l', -1.96, 0.3], ['a', -1.5, 0.3, 0.46], ['l', 0.96, 0.3], ['a', 1.42, 0.3, 0.46],
    ['l', 2.08, 0.3], ['q', 2.3, 0.3, 2.31, 0.52], ['q', 2.31, 0.72, 2.12, 0.77],
    ['q', 1.6, 0.86, 1.02, 0.92], ['l', -1.86, 0.99], ['q', -2.27, 0.99, -2.3, 0.76], ['l', -2.32, 0.46], ['q', -2.32, 0.3, -2.2, 0.3]], 1.62, 0.14, 'paint'));
  g.add(extrude([['m', 1.0, 0.9], ['q', 0.55, 1.27, 0.15, 1.36], ['l', -1.15, 1.4], ['q', -1.78, 1.36, -1.9, 0.97], ['l', 1.0, 0.9]], 1.3, 0.12, 'glass'));
  g.add(extrude([['m', 0.12, 1.42], ['l', -1.12, 1.46], ['q', -1.5, 1.44, -1.58, 1.33], ['l', -1.5, 1.31], ['q', -1.3, 1.4, -1.1, 1.41], ['l', 0.1, 1.38]], 1.3, 0.1, 'paint'));
  for (const z of [1.42, -1.5]) for (const x of [0.82, -0.82]) {
    const tire = new T.Mesh(new T.TorusGeometry(0.27, 0.1, 16, 48), mat('tire')); tire.rotation.y = Math.PI / 2; tire.scale.set(1, 1, 1.25); tire.position.set(x, 0.37, z); g.add(tire);
    const rim = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.22, 32), mat('rim')); rim.rotation.z = Math.PI / 2; rim.position.set(x, 0.37, z); g.add(rim);
  }
  const head = new T.Mesh(new T.BoxGeometry(1.4, 0.04, 0.06), mat('drl')); head.position.set(0, 0.73, 2.21); g.add(head);
  const tail = new T.Mesh(new T.BoxGeometry(1.7, 0.05, 0.06), mat('taillight')); tail.position.set(0, 0.88, -2.3); g.add(tail);
  return g;
}

class Car3DCard extends HTMLElement {
  static getStubConfig() { return { prefix: 'ev6', title: 'My Car' }; }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._cfg = Object.assign({
      title: '', model: '', model_length: 4.7, model_rotation: 0, paint_color: '#4f5256', recolor: null, lights: true, demo: false, demo_interval: 4,
      height: '62vh', background: 'studio', auto_rotate: true, reflection: true, prefix: '', entities: {}, markers: {},
    }, config);
    if (this._root) { this._root.innerHTML = ''; this._root = null; this._built = false; }
  }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', rows: 10 }; }

  /* entity id for a key: explicit `entities:` wins, otherwise derived from `prefix:` */
  _ent(key, tpl) {
    const e = this._cfg.entities || {};
    if (key in e) return e[key] || null;
    return this._cfg.prefix && tpl ? tpl.replace('{p}', this._cfg.prefix) : null;
  }
  _st(id) {
    if (this._show && id && id in this._show) return this._show[id];
    const s = id && this._hass && this._hass.states[id]; return s ? s.state : undefined;
  }
  _showScene(i) {
    const sc = SHOW_SCENES[i % SHOW_SCENES.length], o = {};
    for (const p of PARTS) { const e = this._ent(p.key, p.kia); if (e) o[e] = sc[p.key] || 'off'; }
    for (const k of ['lock', 'plug', 'charging', 'climate', 'defrost', 'rear_defrost']) {
      const e = this._ent(k, STATUS[k]); if (e) o[e] = sc[k] || (k === 'lock' ? 'locked' : 'off');
    }
    this._show = o; this._showIdx = i;
    const lbl = this._root && this._root.querySelector('.showlbl');
    if (lbl) lbl.textContent = `${(i % SHOW_SCENES.length) + 1}/${SHOW_SCENES.length} · ${this._t.scenes[i % SHOW_SCENES.length]}`;
    this._updateStatus();
  }
  _toggleShow(on) {
    clearInterval(this._showTimer); const t = this._t;
    const btn = this._root.querySelector('.showbtn');
    if (on) {
      this._showScene(0);
      this._showTimer = setInterval(() => this._showScene(this._showIdx + 1), (Number(this._cfg.demo_interval) || 4) * 1000);
      if (this._ctl) this._ctl.autoRotate = true;
    } else {
      this._show = null; this._updateStatus();
      const lbl = this._root.querySelector('.showlbl'); if (lbl) lbl.textContent = t.showNote;
      if (this._ctl) this._ctl.autoRotate = !!this._cfg.auto_rotate;
    }
    if (btn) { btn.classList.toggle('on', on); btn.querySelector('span').textContent = on ? t.showStop : t.showStart;
      btn.querySelector('ha-icon').setAttribute('icon', on ? 'mdi:stop' : 'mdi:play'); }
  }
  disconnectedCallback() { clearInterval(this._showTimer); }
  get _t() { const l = (this._hass && this._hass.language || 'en').slice(0, 2); return I18N[l] || I18N.en; }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._render();
    this._updateStatus();
  }

  _render() {
    const c = this._cfg, t = this._t;
    this._root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `
      <style>
        ha-card{overflow:hidden;position:relative}
        .stage{position:relative;height:${c.height};min-height:320px;touch-action:none;transition:background .4s}
        canvas{display:block;width:100%;height:100%}
        .title{position:absolute;top:14px;left:18px;font-size:20px;font-weight:600;letter-spacing:.5px;color:var(--c3d-text);pointer-events:none}
        .sub{position:absolute;top:42px;left:18px;font-size:12px;color:var(--c3d-sub);pointer-events:none}
        .hint{position:absolute;bottom:10px;width:100%;text-align:center;font-size:11px;color:var(--c3d-sub);pointer-events:none;opacity:.8}
        .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--c3d-sub);font-size:14px;text-align:center;padding:0 20px}
        .tbtn{all:unset;position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:rgba(127,127,127,.25);color:var(--c3d-text);cursor:pointer;backdrop-filter:blur(4px)}
        .tbtn ha-icon{--mdc-icon-size:20px}
        .lbl{position:absolute;transform:translate(-50%,-130%);background:#d32f2f;color:#fff;font-size:12px;font-weight:600;
          padding:3px 8px;border-radius:10px;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.4)}
        .lbl.w{background:#ef6c00}
        .open,.panel{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px 0}
        .panel{padding-bottom:16px}
        .chip{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:14px;font-size:14px;
          background:var(--secondary-background-color,rgba(127,127,127,.12));color:var(--primary-text-color)}
        .chip ha-icon{--mdc-icon-size:20px}
        .ok{color:var(--success-color,#43a047)} .warn{color:var(--warning-color,#fb8c00)} .bad{color:var(--error-color,#e53935)}
        .rbtn{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:14px;font-size:14px;
          background:var(--primary-color);color:var(--text-primary-color,#fff);margin-left:auto}
        .rbtn[disabled]{opacity:.5;cursor:default}
        .showbar{display:flex;align-items:center;gap:12px;padding:0 16px 16px;flex-wrap:wrap}
        .showbtn{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:10px 18px;border-radius:14px;font-size:15px;font-weight:500;
          background:var(--success-color,#43a047);color:#fff}
        .showbtn.on{background:var(--error-color,#e53935)}
        .showlbl{font-size:13px;color:var(--secondary-text-color)}
        .demo{position:absolute;bottom:28px;width:100%;text-align:center;font-size:11px;color:var(--c3d-sub);pointer-events:none}
      </style>
      <ha-card>
        <div class="stage">
          <div class="loading">${t.loading}</div>
          <div class="title"></div><div class="sub"></div>
          <div class="hint">${t.hint}</div>
          ${c.model ? '' : `<div class="demo">${t.demo}</div>`}
          <button class="tbtn" title="${t.bg}"><ha-icon icon="mdi:palette"></ha-icon></button>
        </div>
        <div class="open"></div>
        <div class="panel"></div>
        ${c.demo ? `<div class="showbar"><button class="showbtn"><ha-icon icon="mdi:play"></ha-icon><span>${t.showStart}</span></button><span class="showlbl">${t.showNote}</span></div>` : ''}
      </ha-card>`;
    const sb = this._root.querySelector('.showbtn');
    if (sb) sb.addEventListener('click', () => this._toggleShow(!this._showTimer || !this._show));
    this._root.querySelector('.title').textContent = c.title || '';
    this._stage = this._root.querySelector('.stage');
    let saved; try { saved = localStorage.getItem('car-3d-card-bg'); } catch (e) { /* no storage */ }
    const def = THEME_ALIAS[c.background] || c.background;
    this._theme = THEMES[saved] ? saved : (THEMES[def] ? def : 'studio');
    this._applyThemeCss();
    const tb = this._root.querySelector('.tbtn');
    tb.addEventListener('click', (e) => {
      e.stopPropagation();
      this._theme = THEME_KEYS[(THEME_KEYS.indexOf(this._theme) + 1) % THEME_KEYS.length];
      try { localStorage.setItem('car-3d-card-bg', this._theme); } catch (err) { /* ignore */ }
      this._applyThemeCss(); if (this._apply3dTheme) this._apply3dTheme();
      tb.title = `${t.bg}: ${t.themes[this._theme]}`;
    });
    // keep swipe gestures on the car from triggering dashboard swipe navigation
    for (const ev of ['touchstart', 'touchmove', 'touchend']) this._stage.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this._init3d().catch((e) => {
      const l = this._root.querySelector('.loading'); if (l) l.textContent = t.failed + e.message;
      console.error('car-3d-card', e);
    });
  }

  async _init3d() {
    const c = this._cfg;
    const T = await import(`${CDN}/+esm`);
    const { GLTFLoader } = await import(`${CDN}/examples/jsm/loaders/GLTFLoader.js/+esm`);
    const { OrbitControls } = await import(`${CDN}/examples/jsm/controls/OrbitControls.js/+esm`);
    const { MeshoptDecoder } = await import(`${CDN}/examples/jsm/libs/meshopt_decoder.module.js/+esm`);
    const { DRACOLoader } = await import(`${CDN}/examples/jsm/loaders/DRACOLoader.js/+esm`);
    const stage = this._stage;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = T.ACESFilmicToneMapping; r.outputColorSpace = T.SRGBColorSpace;
    stage.prepend(r.domElement);
    const scene = new T.Scene();
    scene.environment = new T.PMREMGenerator(r).fromScene(studioEnv(T), 0.02).texture;
    const cam = new T.PerspectiveCamera(32, 1, 0.1, 100); cam.position.set(4.5, 2.1, 5.0);

    // lights
    const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 8, 5); scene.add(sun);
    const spot = new T.SpotLight(0xffffff, 1, 14, Math.PI / 7, 0.6, 1.2); spot.position.set(0, 7.5, 0.5); scene.add(spot); scene.add(spot.target);
    const rim = new T.DirectionalLight(0x4da3ff, 0); rim.position.set(-5, 3, -6); scene.add(rim);

    // floor (fades out) above a mirrored copy of the car → reflection
    const floorCv = document.createElement('canvas'); floorCv.width = floorCv.height = 512;
    const floorTex = new T.CanvasTexture(floorCv); floorTex.colorSpace = T.SRGBColorSpace;
    const floor = new T.Mesh(new T.CircleGeometry(9, 96), new T.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, toneMapped: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.renderOrder = 1; scene.add(floor);
    const ringMat = (color, opacity) => new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, toneMapped: false });
    const ring = new T.Mesh(new T.RingGeometry(2.9, 2.93, 160), ringMat(0x5cc2ff, 0.75));
    const glow = new T.Mesh(new T.RingGeometry(2.8, 3.05, 160), ringMat(0x3fb4ff, 0.12));
    for (const [m, y, o] of [[ring, 0.006, 3], [glow, 0.005, 2]]) { m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = o; scene.add(m); }
    // soft contact shadow
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g2 = cv.getContext('2d'); const gr = g2.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 256, 256);
    const shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.renderOrder = 2; scene.add(shadow);

    this._apply3dTheme = () => {
      const th = THEMES[this._theme];
      const ctx = floorCv.getContext('2d'); ctx.clearRect(0, 0, 512, 512);
      const col = new T.Color(th.floor), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
      const fg = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      fg.addColorStop(0, `rgba(${rgb},${c.reflection ? th.refl : 0.97})`); fg.addColorStop(0.28, `rgba(${rgb},0.93)`);
      fg.addColorStop(0.5, `rgba(${rgb},0.55)`); fg.addColorStop(0.8, `rgba(${rgb},0)`);
      ctx.fillStyle = fg; ctx.fillRect(0, 0, 512, 512); floorTex.needsUpdate = true;
      sun.intensity = th.sun; spot.intensity = th.spot; rim.intensity = th.rim; ring.visible = glow.visible = th.ring;
      r.toneMappingExposure = th.exp;
    };
    this._apply3dTheme();

    // controls
    const ctl = new OrbitControls(cam, r.domElement);
    ctl.target.set(0, 0.7, 0); ctl.enableDamping = true; ctl.enablePan = false;
    ctl.minDistance = 3.6; ctl.maxDistance = 13; ctl.maxPolarAngle = Math.PI * 0.49;
    ctl.autoRotate = !!c.auto_rotate; ctl.autoRotateSpeed = 0.6; this._ctl = ctl;
    ctl.addEventListener('start', () => { ctl.autoRotate = false; clearTimeout(this._ar); });
    ctl.addEventListener('end', () => { if (c.auto_rotate) this._ar = setTimeout(() => { ctl.autoRotate = true; }, 20000); });

    // model: own GLB or demo car
    let car;
    if (c.model) {
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      const draco = new DRACOLoader(); draco.setDecoderPath(`${CDN}/examples/jsm/libs/draco/gltf/`); loader.setDRACOLoader(draco);
      car = (await loader.loadAsync(c.model)).scene;
    } else {
      car = buildDemoCar(T);
    }
    const M = MATS(T, new T.Color(c.paint_color), scene.environment);
    const recolor = c.recolor === null ? !c.model : !!c.recolor;  // demo car: always; own model: only if `recolor: true`
    car.traverse((o) => {
      if (!o.isMesh) return;
      const name = (o.material && o.material.name) || '';
      if (recolor && M[name]) { o.material = M[name](); o.material.name = name; }
    });
    // normalize: rotate so the front faces +Z, scale to model_length, centre, put on the ground
    const holder = new T.Group(); holder.add(car); car.rotation.y = (Number(c.model_rotation) || 0) * Math.PI / 180;
    let box = new T.Box3().setFromObject(holder); const size = box.getSize(new T.Vector3());
    const s = (Number(c.model_length) || 4.7) / Math.max(size.x, size.z); holder.scale.setScalar(s);
    box = new T.Box3().setFromObject(holder); const ctr = box.getCenter(new T.Vector3());
    holder.position.set(-ctr.x, -box.min.y, -ctr.z);
    box = new T.Box3().setFromObject(holder); const dim = box.getSize(new T.Vector3());
    scene.add(holder);
    if (c.lights) {   // soft glow around head-/daytime-/tail lights: translucent shells that follow the lamp surface
      const glow = { drl: 0xdfeaff, taillight: 0xff2a18 };
      const shells = [[0.006, 0.45], [0.016, 0.2], [0.032, 0.08]];   // [offset in m, opacity]
      holder.updateMatrixWorld(true); const ws = new T.Vector3(); const add = [];
      holder.traverse((o) => {
        const col = o.isMesh && glow[o.material && o.material.name]; if (!col || !o.geometry.attributes.normal) return;
        o.getWorldScale(ws); const k = 1 / Math.max(ws.x, ws.y, ws.z, 1e-6);
        for (const [off, op] of shells) {
          const m = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
          const d = off * k;
          m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${d.toFixed(6)};`); };
          m.customProgramCacheKey = () => 'glow' + d.toFixed(6);
          const sh = new T.Mesh(o.geometry, m); sh.renderOrder = 2; add.push([o, sh]);
        }
      });
      add.forEach(([o, sh]) => o.add(sh));
    }
    if (c.reflection) { const mirror = holder.clone(); mirror.scale.y *= -1; mirror.position.y = -mirror.position.y; scene.add(mirror); }
    shadow.scale.set(dim.x * 1.6, dim.z * 1.3, 1);
    ctl.target.set(0, dim.y * 0.45, 0);
    const l = this._root.querySelector('.loading'); if (l) l.remove();

    // markers
    const t = this._t;
    this._marks = [];
    for (const p of PARTS) {
      const ent = this._ent(p.key, p.kia); if (!ent) continue;
      const rel = (c.markers && c.markers[p.key]) || p.pos;
      const col = p.warn ? 0xff8c1a : 0xff2a2a;
      const m = new T.Mesh(new T.SphereGeometry(0.09, 24, 16), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false }));
      m.position.set(rel[0] * dim.x / 2, rel[1] * dim.y, rel[2] * dim.z / 2); m.renderOrder = 10; m.visible = false; scene.add(m);
      const halo = new T.Mesh(new T.SphereGeometry(0.2, 24, 16), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthTest: false }));
      halo.renderOrder = 9; m.add(halo);
      const lbl = document.createElement('div'); lbl.className = p.warn ? 'lbl w' : 'lbl';
      lbl.textContent = p.warn ? t.names[p.key] : `${t.names[p.key]} ${t.open}`; lbl.style.display = 'none'; stage.append(lbl);
      this._marks.push({ ...p, ent, m, halo, lbl, on: false });
    }

    const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    new ResizeObserver(resize).observe(stage); resize();
    this._visible = true;
    new IntersectionObserver((es) => { this._visible = es[0].isIntersecting; }).observe(stage);
    const v = new T.Vector3();
    const loop = (time) => {
      requestAnimationFrame(loop);
      if (!this._visible || document.hidden || !this.isConnected) return;
      ctl.update();
      const pulse = 1 + 0.35 * Math.sin(time / 220);
      if (glow.visible) glow.material.opacity = 0.09 + 0.05 * Math.sin(time / 600);
      for (const k of this._marks) {
        if (!k.on) continue;
        k.halo.scale.setScalar(pulse);
        v.copy(k.m.position).project(cam);
        k.lbl.style.left = `${(v.x + 1) / 2 * stage.clientWidth}px`; k.lbl.style.top = `${(1 - v.y) / 2 * stage.clientHeight}px`;
      }
      r.render(scene, cam);
    };
    requestAnimationFrame(loop);
    this._updateStatus();
  }

  _updateStatus() {
    if (!this._root || !this._hass) return;
    const t = this._t, st = (id) => this._st(id), E = (k) => this._ent(k, STATUS[k]);
    const open = [], warn = []; let anyPart = false, anyWarn = false;
    for (const p of PARTS) {
      const ent = this._ent(p.key, p.kia); if (!ent || st(ent) === undefined) continue;
      if (p.warn) anyWarn = true; else anyPart = true;
      const on = st(ent) === 'on';
      if (on) (p.warn ? warn : open).push(t.names[p.key]);
      const k = this._marks && this._marks.find((x) => x.key === p.key);
      if (k) { k.on = on; k.m.visible = on; k.lbl.style.display = on ? '' : 'none'; }
    }
    const chip = (icon, text, cls = '') => `<span class="chip"><ha-icon class="${cls}" icon="${icon}"></ha-icon>${text}</span>`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    let top = '';
    if (anyPart) top += open.length ? chip('mdi:car-door', esc(t.openList + open.join(', ')), 'bad') : chip('mdi:check-circle', t.allClosed, 'ok');
    if (anyWarn) top += warn.length ? chip('mdi:alert', esc(warn.join(', ')), 'warn') : chip('mdi:car-tire-alert', esc(t.okWarn), 'ok');
    const openEl = this._root.querySelector('.open'); if (openEl.innerHTML !== top) openEl.innerHTML = top;

    const unit = (id) => (this._hass.states[id] && this._hass.states[id].attributes.unit_of_measurement) || '';
    const chips = [];
    const lk = st(E('lock'));
    if (lk !== undefined) chips.push(lk === 'locked' ? chip('mdi:lock', t.locked, 'ok') : chip('mdi:lock-open-variant', t.unlocked, 'warn'));
    const bat = st(E('battery')); if (bat !== undefined) chips.push(chip('mdi:battery-high', `${esc(bat)} %`));
    const rng = st(E('range')); if (rng !== undefined) chips.push(chip('mdi:map-marker-distance', `${esc(rng)} ${esc(unit(E('range')))}`));
    const fuel = st(E('fuel_level')); if (fuel !== undefined) chips.push(chip('mdi:gas-station', `${esc(fuel)} ${esc(unit(E('fuel_level')) || '%')}`));
    const frng = st(E('fuel_range')); if (frng !== undefined) chips.push(chip('mdi:map-marker-distance', `${esc(frng)} ${esc(unit(E('fuel_range')))}`));
    if (st(E('charging')) === 'on') chips.push(chip('mdi:ev-station', t.charging, 'ok'));
    else if (st(E('plug')) === 'on') chips.push(chip('mdi:power-plug', t.plugged));
    if (st(E('climate')) === 'on') chips.push(chip('mdi:air-conditioner', t.climate, 'ok'));
    if (st(E('defrost')) === 'on') chips.push(chip('mdi:car-defrost-front', t.defrost, 'ok'));
    if (st(E('rear_defrost')) === 'on') chips.push(chip('mdi:car-defrost-rear', t.rearDefrost, 'ok'));
    const refresh = E('refresh'); const hasRefresh = !this._show && refresh && st(refresh) !== undefined;
    if (hasRefresh) chips.push(`<button class="rbtn"><ha-icon icon="mdi:refresh"></ha-icon><span>${t.refresh}</span></button>`);
    const html = chips.join('');
    if (html !== this._lastPanel) {
      this._lastPanel = html;
      const panel = this._root.querySelector('.panel'); panel.innerHTML = html;
      const b = panel.querySelector('.rbtn');
      if (b) b.onclick = async () => {
        if (!confirm(t.confirm)) return;
        b.disabled = true; b.lastChild.textContent = t.refreshing;
        try { await this._hass.callService('button', 'press', { entity_id: refresh }); }
        finally { setTimeout(() => { b.disabled = false; b.lastChild.textContent = t.refresh; }, 15000); }
      };
    }
    const upd = st(E('updated')), sub = this._root.querySelector('.sub');
    if (sub) {
      const d = upd ? new Date(upd) : null;
      sub.textContent = d && !isNaN(d) ? t.updated + d.toLocaleString(this._hass.language || undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    }
  }

  _applyThemeCss() {
    const th = THEMES[this._theme];
    this._stage.style.background = th.css;
    this._stage.style.setProperty('--c3d-text', th.text);
    this._stage.style.setProperty('--c3d-sub', th.sub);
  }
}

if (!customElements.get('car-3d-card')) customElements.define('car-3d-card', Car3DCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'car-3d-card', name: 'Car 3D Card', description: 'Your car as an interactive 3D model with live door, window, lock, charging and warning status.', preview: false, documentationURL: 'https://github.com/thisislennard/ha-car-3d-card' });
console.info(`%c CAR-3D-CARD %c v${CARD_VERSION} `, 'color:#fff;background:#3fb4ff;font-weight:700', 'color:#3fb4ff;background:#1c1f24');
